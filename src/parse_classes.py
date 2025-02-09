import sys
import json
import ast

def find_class_names(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        node = ast.parse(file.read())
        class_names = [n.name for n in node.body if isinstance(n, ast.ClassDef)]
        return class_names

if __name__ == "__main__":
    try:
        classes = find_class_names(sys.argv[1])
        print(json.dumps(classes))  # Output the list of class names as JSON
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
