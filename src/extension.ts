import axios from 'axios';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== 'python' || !document.fileName.endsWith('views.py')) {
            return;
        }

        const scriptPath = './src/parse_functions.py';
        const command = `python ${scriptPath} ${document.fileName}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return;
            }

            const functionNames = JSON.parse(stdout);
            console.log(functionNames); // Array of function names
            // Here you can implement logic to check if a test exists for each function
        });
    });

    context.subscriptions.push(disposable);
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
