# parse_functions.py
import ast
import json
import sys

class FunctionVisitor(ast.NodeVisitor):
    def __init__(self):
        self.functions = []

    def visit_FunctionDef(self, node):
        self.functions.append(node.name)
        self.generic_visit(node)

def main():
    filename = sys.argv[1]
    with open(filename, "r") as file:
        tree = ast.parse(file.read())
    
    visitor = FunctionVisitor()
    visitor.visit(tree)

    print(json.dumps(visitor.functions))

if __name__ == "__main__":
    main()
