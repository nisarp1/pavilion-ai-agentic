import datetime
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


def _blob_url(blob) -> str:
    """Return the best available URL for a blob.

    Tries a signed URL first (works with uniform bucket-level access and private
    buckets). Falls back to the plain public URL if signing isn't available
    (e.g. bucket already has allUsers objectViewer IAM).
    """
    try:
        return blob.generate_signed_url(
            expiration=datetime.timedelta(days=7),
            method='GET',
            version='v4',
        )
    except Exception as e:
        logger.warning(f"Signed URL generation failed ({e}), falling back to public URL")
        return blob.public_url


def signed_url_for_gcs_url(gcs_url: str, expiry_days: int = 7) -> str:
    """Given a gs:// or https://storage.googleapis.com/... URL, return a fresh signed URL."""
    client = _get_client()
    if gcs_url.startswith('gs://'):
        parts = gcs_url[5:].split('/', 1)
        bucket_name, blob_name = parts[0], parts[1]
    elif gcs_url.startswith('https://storage.googleapis.com/'):
        path = gcs_url[len('https://storage.googleapis.com/'):]
        bucket_name, blob_name = path.split('/', 1)
        # Strip existing query string (old signed URL)
        blob_name = blob_name.split('?')[0]
    else:
        return gcs_url  # Not a GCS URL — return as-is

    blob = client.bucket(bucket_name).blob(blob_name)
    return blob.generate_signed_url(
        expiration=datetime.timedelta(days=expiry_days),
        method='GET',
        version='v4',
    )


def upload_bytes(data: bytes, blob_name: str, content_type: str = 'application/octet-stream') -> str:
    """Upload raw bytes and return a usable URL."""
    client = _get_client()
    bucket = client.bucket(_bucket_name())
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)
    return _blob_url(blob)


def upload_file(local_path: str, blob_name: str, content_type: str = 'application/octet-stream') -> str:
    """Upload a local file and return a usable URL."""
    client = _get_client()
    bucket = client.bucket(_bucket_name())
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path, content_type=content_type)
    return _blob_url(blob)


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
