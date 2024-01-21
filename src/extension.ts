import axios from 'axios';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('pythonTestChecker');
    context.subscriptions.push(diagnosticCollection);

    let disposable = vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== 'python' || !document.fileName.endsWith('views.py')) {
            return;
        }

        getFunctionNames(document, functionNames => {
            const dir = path.dirname(document.fileName);
            const testFilePath = path.join(dir, 'tests.py');

            parseTestFileUsingPythonScript(testFilePath, testFunctionNames => {
                const diagnostics: vscode.Diagnostic[] = [];
                functionNames.forEach(funcName => {
                    if (!testFunctionNames.includes(`test_${funcName}`)) {
                        const range = findRangeOfFunctionName(document, funcName);
                        if (range) {
                            const diagnostic = new vscode.Diagnostic(
                                range, 
                                `Test for '${funcName}' is missing`, 
                                vscode.DiagnosticSeverity.Warning
                            );
                            diagnostic.code = 'missing_test';
                            diagnostics.push(diagnostic);
                        }
                    }
                });

                diagnosticCollection.set(document.uri, diagnostics);
            });
        });
    });

    context.subscriptions.push(disposable);
}

function getFunctionNames(document: vscode.TextDocument, callback: (functionNames: string[]) => void) {
    const scriptPath = './src/parse_functions.py';
    const command = `python ${scriptPath} "${document.fileName}"`;

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

        const functionNames = JSON.parse(stdout);
        callback(functionNames);
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
    const functionDeclaration = `def ${functionName}(`;
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(functionDeclaration)) {
            const startPos = new vscode.Position(i, lineText.indexOf(functionDeclaration));
            const endPos = new vscode.Position(i, startPos.character + functionDeclaration.length);
            return new vscode.Range(startPos, endPos);
        }
    }
    return null;
}

// Function to send code to an API
async function sendCodeToApi(code: string): Promise<any> {
	try {
		const data = {
			model: "gpt-3.5-turbo",
			messages: [{ "role": "user", "content": code + "Write Unit Test Cases for this using pytest"}]
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

// This method is called when your extension is deactivated
export function deactivate() {}
