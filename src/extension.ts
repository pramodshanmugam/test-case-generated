import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import axios from 'axios';
import * as fs from 'fs';
import * as crypto from 'crypto';


export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('pythonTestClassChecker');
    context.subscriptions.push(diagnosticCollection);

    let disposable = vscode.workspace.onDidSaveTextDocument(async document => {
        if (document.languageId !== 'python' || !document.fileName.endsWith('views.py')) {
            return;
        }
    
        let classNames = await getClassNames(document);
        let checksums = context.workspaceState.get('checksums', {}) as { [key: string]: string };
    
        let newChecksums: { [key: string]: string } = {};
        for (const className of classNames) {
            const range = findRangeOfClassName(document, className);
            if (range) {
                const classContent = document.getText(range);
                newChecksums[className] = calculateChecksum(classContent);
    
                if (checksums[className] && checksums[className] !== newChecksums[className]) {
                    const selection = await vscode.window.showWarningMessage(`Class '${className}' has been changed. Regenerate test case?`, 'Yes', 'No');
                    if (selection === 'Yes') {
                        try {
                            const testClassName = `Test${className}`;
                            const urlsFilePath = path.join(path.dirname(document.uri.fsPath), 'urls.py');
                            console.log(`classContent: ${classContent}`);
                            console.log(`urlsFilePath: ${urlsFilePath}`);
                            const apiResponse = await sendCodeToApi(classContent, urlsFilePath);

                            await replaceInTestFile(document.uri.fsPath, testClassName, apiResponse);
                        } catch (error) {
                            vscode.window.showErrorMessage('Failed to regenerate test case');
                            console.error(error);
                        }
                    }
                }
            }
        }

        context.workspaceState.update('checksums', newChecksums);
        updateDiagnostics(document, classNames, diagnosticCollection);
    });

    


    context.subscriptions.push(disposable);

    const provider = new PythonTestCodeActionProvider();
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider('python', provider, {
        providedCodeActionKinds: PythonTestCodeActionProvider.providedCodeActionKinds
    }));

    context.subscriptions.push(vscode.commands.registerCommand('extension.createTestCase', async (document: vscode.TextDocument, range: vscode.Range) => {
        try {
            const code = document.getText(range);
            const urlsFilePath = path.join(path.dirname(document.uri.fsPath), 'urls.py');
            const apiResponse = await sendCodeToApi(code,urlsFilePath );
            await appendToTestFile(document.uri.fsPath, apiResponse);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to create test case');
            console.error(error);
        }
    }));
}
function getClassNames(document: vscode.TextDocument): Promise<string[]> {
    // This function now calls the updated Python script that parses class names
    // You will need to update the Python script to parse and return class names
    const scriptPath = './src/parse_classes.py'; // Assume you've created a new script for parsing classes
    const command = `python3 ${scriptPath} "${document.fileName}"`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return reject(new Error(stderr));
            }
            const classNames = JSON.parse(stdout);
            resolve(classNames);
        });
    });
}

function calculateChecksum(content: crypto.BinaryLike) {
    return crypto.createHash('sha256') // Create a SHA256 hash object
               .update(content)        // Update the hash object with the given content
               .digest('hex');         // Compute the digest in hexadecimal format
}



function findRangeOfClassName(document: vscode.TextDocument, className: string): vscode.Range | null {
    let startLine = -1;
    let endLine = -1;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        if (lineText.startsWith(`class ${className}`) && startLine === -1) {
            startLine = i;
            // Continue to the end of the class definition or until the next class definition starts
            for (let j = i + 1; j < document.lineCount; j++) {
                const nextLineText = document.lineAt(j).text;
                if (nextLineText.startsWith('class ') || j === document.lineCount - 1) {
                    endLine = j;
                    break;
                }
            }
        }
        if (endLine !== -1) {
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
// Add urlsFilePath as the second parameter
async function sendCodeToApi(code: string, urlsFilePath: string): Promise<any> {
    try {
        // Read urls.py contents
        const urlsContent = fs.readFileSync(urlsFilePath, 'utf8');

        // Structure your data including the contents of urls.py
        const data = {
            model: "gpt-3.5-turbo-0125",
            messages: [
                { "role": "user", "content": code + "Write Unit Test Cases for this class and name the test case as test{classname} for reference the the urls.py file"+ urlsContent + "Give me only the code that can be run directly as response"},
                // Include urlsContent if needed, format based on API requirement
            ]
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
            .filter(diagnostic => diagnostic.code === 'missing_test_class')
            .map(diagnostic => this.createFix(document, diagnostic.range, diagnostic.message));
    }

    private createFix(document: vscode.TextDocument, range: vscode.Range, diagnosticMessage: string): vscode.CodeAction {
        const fix = new vscode.CodeAction(`Create test for ${diagnosticMessage}`, vscode.CodeActionKind.QuickFix);
        fix.command = { title: 'Create Test Case', command: 'extension.createTestCase', arguments: [document, range] };
        return fix;
    }
}


// This method is called when your extension is deactivated
export function deactivate() {}

function updateDiagnostics(document: vscode.TextDocument, classNames: string[], diagnosticCollection: vscode.DiagnosticCollection) {
    const diagnostics: vscode.Diagnostic[] = [];

    classNames.forEach(className => {
        const testClassName = `Test${className}`;
        const hasTestClass = checkIfTestClassExists(testClassName, document);

        if (!hasTestClass) {
            const range = findRangeOfClassName(document, className);
            if (range) {
                // Find the range of just the class name (not the whole class body)
                const classNameRange = new vscode.Range(
                    range.start,
                    new vscode.Position(range.start.line, range.start.character + `class ${className}`.length)
                );

                const diagnostic = new vscode.Diagnostic(
                    classNameRange, 
                    `Test class for '${className}' is missing`, 
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'missing_test_class';
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

function checkIfTestClassExists(testClassName: string, document: vscode.TextDocument): boolean {
    // This function would check the entire workspace or a specific test directory for a file that contains the test class
    // Assuming the tests.py file is in the same directory as the document
    const dir = path.dirname(document.uri.fsPath);
    const testFilePath = path.join(dir, 'tests.py'); // Assumes a naming convention like test_module.py

    if (fs.existsSync(testFilePath)) {
        const testFileContent = fs.readFileSync(testFilePath, 'utf8');
        return testFileContent.includes(`class ${testClassName}`);
    }

    return false;
}