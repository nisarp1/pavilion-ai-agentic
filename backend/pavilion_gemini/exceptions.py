"""
Standardized API error response handler for all DRF exceptions.
All errors follow the shape: {success: false, error: {status_code, message, detail}}
"""
from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError


def _flatten_errors(data):
    """Extract a human-readable message string from DRF error data."""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        messages = []
        for item in data:
            messages.append(_flatten_errors(item))
        return ' '.join(messages)
    if isinstance(data, dict):
        if 'detail' in data and isinstance(data['detail'], str):
            return data['detail']
        messages = []
        for key, value in data.items():
            msg = _flatten_errors(value)
            if key not in ('detail', 'non_field_errors'):
                messages.append(f"{key}: {msg}")
            else:
                messages.append(msg)
        return ' '.join(messages)
    return str(data)


def pavilion_exception_handler(exc, context):
    """
    Custom DRF exception handler that wraps all errors in a consistent envelope:
    {
        "success": false,
        "error": {
            "status_code": 400,
            "message": "Human-readable summary",
            "detail": <original DRF error data>
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        original_data = response.data
        response.data = {
            'success': False,
            'error': {
                'status_code': response.status_code,
                'message': _flatten_errors(original_data),
                'detail': original_data,
            }
        }

    return response
