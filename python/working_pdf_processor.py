#!/usr/bin/env python3
"""
Working PDF processor that handles environment issues
"""

import json
import sys
from pathlib import Path

def main():
    try:
        # Check arguments
        if len(sys.argv) != 2:
            result = {
                "success": False,
                "error": "Invalid arguments",
                "results": {
                    "tspId": None,
                    "confidence": 0.0,
                    "method": "error",
                    "description": "Invalid arguments provided",
                    "accuracy": "0%",
                    "extractedText": "",
                    "processingTime": "error",
                    "library": "PyPDF2"
                }
            }
            json_output = json.dumps(result)
            print(json_output)
            return
        
        pdf_path = sys.argv[1]
        
        # Check file existence
        if not Path(pdf_path).exists():
            result = {
                "success": False,
                "error": f"File not found: {pdf_path}",
                "results": {
                    "tspId": None,
                    "confidence": 0.0,
                    "method": "error",
                    "description": f"File not found: {pdf_path}",
                    "accuracy": "0%",
                    "extractedText": "",
                    "processingTime": "error",
                    "library": "PyPDF2"
                }
            }
            json_output = json.dumps(result)
            print(json_output)
            return
        
        # Try to import PyPDF2
        try:
            import PyPDF2
        except ImportError as e:
            result = {
                "success": False,
                "error": f"PyPDF2 import failed: {str(e)}",
                "results": {
                    "tspId": None,
                    "confidence": 0.0,
                    "method": "error",
                    "description": f"PyPDF2 import failed: {str(e)}",
                    "accuracy": "0%",
                    "extractedText": "",
                    "processingTime": "error",
                    "library": "PyPDF2"
                }
            }
            json_output = json.dumps(result)
            print(json_output)
            return
        
        # Process PDF
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                if not pdf_reader.pages:
                    result = {
                        "success": False,
                        "error": "No pages found in PDF",
                        "results": {
                            "tspId": None,
                            "confidence": 0.0,
                            "method": "error",
                            "description": "No pages found in PDF",
                            "accuracy": "0%",
                            "extractedText": "",
                            "processingTime": "error",
                            "library": "PyPDF2"
                        }
                    }
                else:
                    # Extract text from first page
                    first_page = pdf_reader.pages[0]
                    page_text = first_page.extract_text()
                    
                    if not page_text:
                        result = {
                            "success": False,
                            "error": "No text content found in PDF",
                            "results": {
                                "tspId": None,
                                "confidence": 0.0,
                                "method": "error",
                                "description": "No text content found in PDF",
                                "accuracy": "0%",
                                "extractedText": "",
                                "processingTime": "error",
                                "library": "PyPDF2"
                            }
                        }
                    else:
                        # Simple TSP ID extraction (find 6-digit numbers)
                        import re
                        matches = re.findall(r'\b\d{6}\b', page_text)
                        
                        if matches:
                            tsp_id = matches[0]
                            result = {
                                "success": True,
                                "results": {
                                    "tspId": tsp_id,
                                    "confidence": 0.8,
                                    "method": "simple_regex",
                                    "description": "Simple regex extraction",
                                    "accuracy": "80%",
                                    "extractedText": f"TSP ID: {tsp_id}",
                                    "processingTime": "fast",
                                    "library": "PyPDF2"
                                }
                            }
                        else:
                            result = {
                                "success": False,
                                "error": "No TSP ID found in PDF",
                                "results": {
                                    "tspId": None,
                                    "confidence": 0.0,
                                    "method": "error",
                                    "description": "No TSP ID found in PDF",
                                    "accuracy": "0%",
                                    "extractedText": "",
                                    "processingTime": "fast",
                                    "library": "PyPDF2"
                                }
                            }
                
        except Exception as e:
            result = {
                "success": False,
                "error": f"PDF processing error: {str(e)}",
                "results": {
                    "tspId": None,
                    "confidence": 0.0,
                    "method": "error",
                    "description": f"PDF processing error: {str(e)}",
                    "accuracy": "0%",
                    "extractedText": "",
                    "processingTime": "error",
                    "library": "PyPDF2"
                }
            }
        
        # Output result
        json_output = json.dumps(result)
        print(json_output)
        
    except Exception as e:
        # Final error handler
        error_response = json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "results": {
                "tspId": None,
                "confidence": 0.0,
                "method": "error",
                "description": f"Unexpected error: {str(e)}",
                "accuracy": "0%",
                "extractedText": "",
                "processingTime": "error",
                "library": "PyPDF2"
                }
            })
        print(error_response)

if __name__ == "__main__":
    main()
