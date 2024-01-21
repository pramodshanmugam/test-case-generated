import * as vscode from 'vscode';
import axios from 'axios';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "test-case-generated" is now active!');

	let disposable = vscode.commands.registerCommand('test-case-generated.helloWorld', async () => {
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			const code = editor.document.getText();
			try {
				const apiResponse = await sendCodeToApi(code);
				console.log(apiResponse); // Log the response
			} catch (error) {
				vscode.window.showErrorMessage('Error processing your request');
				console.error(error);
			}
		} else {
			vscode.window.showInformationMessage('Open a file to use this command');
		}
	});

	context.subscriptions.push(disposable);
}

// Function to send code to an API
async function sendCodeToApi(code: string): Promise<any> {
	try {
		const data = {
			model: "gpt-3.5-turbo",
			messages: [{ "role": "user", "content": code }]
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
