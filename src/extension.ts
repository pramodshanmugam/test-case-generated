import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import axios from 'axios';
import * as fs from 'fs';
import * as crypto from 'crypto';

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('pythonTestChecker');
    context.subscriptions.push(diagnosticCollection);

    let disposable = vscode.workspace.onDidSaveTextDocument(async document => {
        if (document.languageId !== 'python' || !document.fileName.endsWith('views.py')) {
            return;
        }
    
        let functionNames = await getFunctionNames(document);
        let checksums = context.workspaceState.get('checksums', {}) as { [key: string]: string };
    
        console.log('Function names:', functionNames); // Debugging log
    
        let newChecksums: { [key: string]: string } = {};
        for (const funcName of functionNames) {
            const range = findRangeOfFunctionName(document, funcName);
            if (range) {
                const functionContent = document.getText(range);
                console.log(`Content for ${funcName}:`, functionContent);
                newChecksums[funcName] = calculateChecksum(functionContent);
                console.log(`Range for ${funcName}:`, range);

                console.log(`Checksum for ${funcName}:`, newChecksums[funcName]); // Debugging log
    
                if (checksums[funcName] && checksums[funcName] !== newChecksums[funcName]) {
                    const selection = await vscode.window.showWarningMessage(`Function '${funcName}' has been changed. Regenerate test case?`, 'Yes', 'No');
                    if (selection === 'Yes') {
                        try {
                            const testFunctionName = `test_${funcName}_%`;
                            const apiResponse = await sendCodeToApi(functionContent);
                            await replaceInTestFile(document.uri.fsPath, testFunctionName, apiResponse);
                        } catch (error) {
                            vscode.window.showErrorMessage('Failed to regenerate test case');
                            console.error(error);
                        }
                    }
                }
            }
        }

        context.workspaceState.update('checksums', newChecksums);
        updateDiagnostics(document, functionNames, diagnosticCollection);
    });


    


    context.subscriptions.push(disposable);

    const provider = new PythonTestCodeActionProvider();
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider('python', provider, {
        providedCodeActionKinds: PythonTestCodeActionProvider.providedCodeActionKinds
    }));

    context.subscriptions.push(vscode.commands.registerCommand('extension.createTestCase', async (document: vscode.TextDocument, range: vscode.Range) => {
        try {
            const code = document.getText(range);
            const apiResponse = await sendCodeToApi(code);
            await appendToTestFile(document.uri.fsPath, apiResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to create test case');
            console.error(error);
        }
    }));
}

function calculateChecksum(content: crypto.BinaryLike) {
    return crypto.createHash('sha256') // Create a SHA256 hash object
               .update(content)        // Update the hash object with the given content
               .digest('hex');         // Compute the digest in hexadecimal format
}
function getFunctionNames(document: vscode.TextDocument): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const scriptPath = './src/parse_functions.py';
        const command = `python ${scriptPath} "${document.fileName}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return reject(new Error(stderr));
            }

            const functionNames = JSON.parse(stdout);
            resolve(functionNames);
        });
    });
}

function parseTestFileUsingPythonScript(filePath: string, callback: (testFunctionNames: string[]) => void) {
    const scriptPath = './src/parse_functions.py';
    const command = `python ${scriptPath} "${filePath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            callback([]);
            return;
        }
        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            callback([]);
            return;
        }

        const testFunctionNames = JSON.parse(stdout);
        callback(testFunctionNames);
    });
}


function findRangeOfFunctionName(document: vscode.TextDocument, functionName: string): vscode.Range | null {
    let startLine = -1;
    let endLine = -1;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        if (lineText.startsWith(`def ${functionName}`) && startLine === -1) {
            startLine = i;
        } else if (startLine !== -1 && (lineText.trim() === '' || !lineText.startsWith('    '))) {
            endLine = i;
            break;
        }
    }

    if (startLine !== -1 && endLine !== -1) {
        const startPos = new vscode.Position(startLine, 0);
        const endPos = new vscode.Position(endLine, 0);
        return new vscode.Range(startPos, endPos);
    }

    return null;
}
// Function to send code to an API
async function sendCodeToApi(code: string): Promise<any> {
	try {
		const data = {
			model: "gpt-3.5-turbo",
			messages: [{ "role": "user", "content": code + "Write Unit Test Cases for this using pytest dont give any comments just the code"}]
		};

		const config = {
			headers: {
				'Authorization': 'Bearer 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' // Replace with your actual token
			}
		};

		const response = await axios.post('https://api.openai.com/v1/chat/completions', data, config);
		return response.data;
	} catch (error) {
		console.error('Error sending code to API:', error);
		throw error;
	}
}

async function appendToTestFile(viewsFilePath: string, apiResponse: any): Promise<void> {
    const dir = path.dirname(viewsFilePath);
    const testFilePath = path.join(dir, 'tests.py');
    const testContent = apiResponse.choices[0].message.content; // Adjust based on actual response structure

    const existingContent = fs.existsSync(testFilePath) ? fs.readFileSync(testFilePath, 'utf8') : '';
    fs.writeFileSync(testFilePath, existingContent + "\n" + testContent);
}

class PythonTestCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction[]> {
        return context.diagnostics
            .filter(diagnostic => diagnostic.code === 'missing_test')
            .map(diagnostic => this.createFix(document, range, diagnostic.message));
    }

    private createFix(document: vscode.TextDocument, range: vscode.Range, diagnosticMessage: string): vscode.CodeAction {
        const fix = new vscode.CodeAction(`Create test for ${diagnosticMessage}`, vscode.CodeActionKind.QuickFix);
        fix.command = { title: 'Create Test Case', command: 'extension.createTestCase', arguments: [document, range] };
        return fix;
    }
}
// This method is called when your extension is deactivated
export function deactivate() {}


function updateDiagnostics(document: vscode.TextDocument, functionNames: string[], diagnosticCollection: vscode.DiagnosticCollection) {
    const diagnostics: vscode.Diagnostic[] = [];

    functionNames.forEach(funcName => {
        const testFunctionName = `test_${funcName}`;
        const hasTest = checkIfTestExists(testFunctionName, document);

        if (!hasTest) {
            const range = findRangeOfFunctionName(document, funcName);
            if (range) {
                // Find the range of just the function name
                const functionNameRange = new vscode.Range(
                    range.start,
                    new vscode.Position(range.start.line, range.start.character + `def ${funcName}`.length)
                );

                const diagnostic = new vscode.Diagnostic(
                    functionNameRange, 
                    `Test for '${funcName}' is missing`, 
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'missing_test';
                diagnostics.push(diagnostic);
            }
        }
    });

    diagnosticCollection.set(document.uri, diagnostics);
}
async function replaceInTestFile(viewsFilePath: string, funcName: string, apiResponse: { choices: { message: { content: any; }; }[]; }) {
    const dir = path.dirname(viewsFilePath);
    const testFilePath = path.join(dir, 'tests.py');
    const newTestContent = apiResponse.choices[0].message.content; // Adjust based on actual response structure

    let existingContent = fs.existsSync(testFilePath) ? fs.readFileSync(testFilePath, 'utf8') : '';
    let lines = existingContent.split('\n');
    let newContent: string[] = [];
    let insideTargetFunction = false;

    // Regular expression to match the test function name pattern
    const startRegex = new RegExp(`def ${funcName}[_\\w]*\\(`, 'g');
    const endRegex = /^def /; // Any other function definition marks the end of the current function

    lines.forEach((line, index) => {
        if (insideTargetFunction) {
            if (line.match(endRegex) || index === lines.length - 1) { // End of the target function block
                newContent.push(newTestContent); // Add the new content for the function
                insideTargetFunction = false;
            }
        } else {
            if (line.match(startRegex)) {
                insideTargetFunction = true; // Start of the target function block
            } else {
                newContent.push(line); // Copy the line as is
            }
        }
    });

    fs.writeFileSync(testFilePath, newContent.join('\n'));
}

function checkIfTestExists(testFunctionName: string, document: vscode.TextDocument): boolean {
    // Assuming the tests.py file is in the same directory as the document
    const dir = path.dirname(document.uri.fsPath);
    const testFilePath = path.join(dir, 'tests.py');

    if (fs.existsSync(testFilePath)) {
        const testFileContent = fs.readFileSync(testFilePath, 'utf8');
        // Simple check: looking for the test function name in the file
        return testFileContent.includes(`def ${testFunctionName}(`);
    }

    return false;
}