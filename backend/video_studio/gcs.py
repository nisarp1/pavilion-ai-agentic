import os
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _get_client():
    from google.cloud import storage
    return storage.Client()


def _bucket_name():
    name = os.environ.get('GCS_BUCKET_NAME', '')
    if not name:
        raise ValueError("GCS_BUCKET_NAME environment variable is not set")
    return name


def upload_bytes(data: bytes, blob_name: str, content_type: str = 'application/octet-stream') -> str:
    """Upload raw bytes and return the public GCS URL."""
    client = _get_client()
    bucket = client.bucket(_bucket_name())
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)
    blob.make_public()
    return blob.public_url


def upload_file(local_path: str, blob_name: str, content_type: str = 'application/octet-stream') -> str:
    """Upload a local file and return the public GCS URL."""
    client = _get_client()
    bucket = client.bucket(_bucket_name())
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path, content_type=content_type)
    blob.make_public()
    return blob.public_url


def download_bytes(gcs_uri_or_blob_name: str) -> bytes:
    """Download from a gs:// URI or a blob name within the default bucket."""
    client = _get_client()
    if gcs_uri_or_blob_name.startswith('gs://'):
        parts = gcs_uri_or_blob_name[5:].split('/', 1)
        bucket_name, blob_name = parts[0], parts[1]
    else:
        bucket_name, blob_name = _bucket_name(), gcs_uri_or_blob_name
    blob = client.bucket(bucket_name).blob(blob_name)
    return blob.download_as_bytes()
