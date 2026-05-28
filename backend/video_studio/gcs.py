import os
import logging
from urllib.parse import urlparse

import boto3

logger = logging.getLogger(__name__)


def _s3():
    region = os.environ.get('AWS_REGION', 'us-east-1')
    return boto3.client('s3', region_name=region)


def _bucket():
    name = os.environ.get('AWS_S3_BUCKET', '')
    if not name:
        raise ValueError("AWS_S3_BUCKET environment variable is not set")
    return name


def _parse_s3_url(url: str) -> tuple:
    """Return (bucket, key) from an s3:// or https S3 URL."""
    if url.startswith('s3://'):
        parts = url[5:].split('/', 1)
        return parts[0], parts[1]
    parsed = urlparse(url)
    if '.s3.' in parsed.netloc or '.s3-' in parsed.netloc:
        bucket = parsed.netloc.split('.')[0]
        key = parsed.path.lstrip('/')
        return bucket, key
    if 's3.amazonaws.com' in parsed.netloc:
        path_parts = parsed.path.lstrip('/').split('/', 1)
        return path_parts[0], path_parts[1] if len(path_parts) > 1 else ''
    # Treat as a key in the default bucket
    return _bucket(), url


def signed_url_for_gcs_url(url: str, expiry_days: int = 7) -> str:
    """Return a fresh presigned S3 URL for an S3 object URL (GCS name kept for compat)."""
    try:
        client = _s3()
        bucket, key = _parse_s3_url(url)
        key = key.split('?')[0]  # strip any existing query string
        return client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiry_days * 86400,
        )
    except Exception as e:
        logger.warning("S3 presigned URL generation failed (%s), returning original URL", e)
        return url


def upload_bytes(data: bytes, key: str, content_type: str = 'application/octet-stream') -> str:
    """Upload raw bytes to S3 and return a presigned URL."""
    client = _s3()
    bucket = _bucket()
    client.put_object(Body=data, Bucket=bucket, Key=key, ContentType=content_type)
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=7 * 86400,
    )


def upload_file(local_path: str, key: str, content_type: str = 'application/octet-stream') -> str:
    """Upload a local file to S3 and return a presigned URL."""
    client = _s3()
    bucket = _bucket()
    client.upload_file(local_path, bucket, key, ExtraArgs={'ContentType': content_type})
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=7 * 86400,
    )


def download_bytes(s3_uri_or_key: str) -> bytes:
    """Download from an s3:// URI or a key within the default bucket."""
    client = _s3()
    if s3_uri_or_key.startswith('s3://'):
        bucket, key = _parse_s3_url(s3_uri_or_key)
    else:
        bucket, key = _bucket(), s3_uri_or_key
    response = client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read()
