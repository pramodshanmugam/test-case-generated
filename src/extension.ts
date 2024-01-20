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
				insertApiResponse(editor, apiResponse);
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
async function sendCodeToApi(code: string): Promise<string> {
	try {
		// Replace with your API endpoint and adjust as necessary
		const response = await axios.post('http://127.0.0.1:8000/endpoint/api/print-data/', { code: code });
		return response.data; // Adjust this based on how your API responds
	} catch (error) {
		console.error('Error sending code to API:', error);
		throw error;
	}
}

// Function to insert API response into the editor
function insertApiResponse(editor: vscode.TextEditor, apiResponse: string) {
	editor.edit(editBuilder => {
		editBuilder.insert(editor.selection.start, apiResponse);
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
