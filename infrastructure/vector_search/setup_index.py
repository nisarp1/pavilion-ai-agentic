#!/usr/bin/env python3
"""
Vertex AI Vector Search Index Setup Script
Creates a vector search index for article embeddings
"""

import os
import sys
import argparse
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))

from google.cloud import aiplatform
from google.cloud.aiplatform import matching_engine


def create_vector_search_index(
    project_id: str,
    location: str = "us-central1",
    index_name: str = "pavilion-article-embeddings",
    dimensions: int = 256,
    distance_measure_type: str = "DOT_PRODUCT",
    description: str = "Article embeddings for semantic search in Pavilion CMS"
) -> str:
    """
    Create a Vertex AI Vector Search index for article embeddings.

    Args:
        project_id: GCP Project ID
        location: GCP region
        index_name: Name of the index
        dimensions: Vector dimensions (256 for text-embedding-004)
        distance_measure_type: DOT_PRODUCT or SQUARED_L2_DISTANCE
        description: Index description

    Returns:
        Index resource name
    """

    print(f"Creating Vector Search Index: {index_name}")
    print(f"Project: {project_id}, Location: {location}")
    print(f"Dimensions: {dimensions}, Distance: {distance_measure_type}")
    print("")

    # Initialize Vertex AI
    aiplatform.init(project=project_id, location=location)

    # Check if index already exists
    try:
        existing_index = aiplatform.MatchingEngineIndex.list(
            filter=f'display_name="{index_name}"'
        )
        if existing_index:
            print(f"✓ Index already exists: {index_name}")
            return existing_index[0].resource_name
    except Exception as e:
        print(f"Info: {e}")

    # Create index configuration
    index_config = {
        "dimensions": dimensions,
        "approximate_neighbors_count": 150,
        "distance_measure_type": distance_measure_type,
    }

    # Create the index
    print("Creating index (this may take several minutes)...")
    index = aiplatform.MatchingEngineIndex.create(
        display_name=index_name,
        contents_delta_uri=None,  # We'll upsert vectors directly
        dimensions=dimensions,
        distance_measure_type=distance_measure_type,
        description=description,
    )

    print(f"✓ Index created successfully!")
    print(f"Resource Name: {index.resource_name}")
    print(f"Index Name: {index.display_name}")

    return index.resource_name


def create_index_endpoint(
    project_id: str,
    location: str = "us-central1",
    endpoint_name: str = "pavilion-search-endpoint",
    description: str = "Endpoint for semantic search on article embeddings"
) -> str:
    """
    Create a Vertex AI Vector Search Index Endpoint.

    Args:
        project_id: GCP Project ID
        location: GCP region
        endpoint_name: Name of the endpoint
        description: Endpoint description

    Returns:
        Endpoint resource name
    """

    print(f"\nCreating Vector Search Endpoint: {endpoint_name}")

    # Initialize Vertex AI
    aiplatform.init(project=project_id, location=location)

    # Check if endpoint already exists
    try:
        existing_endpoints = aiplatform.MatchingEngineIndexEndpoint.list(
            filter=f'display_name="{endpoint_name}"'
        )
        if existing_endpoints:
            print(f"✓ Endpoint already exists: {endpoint_name}")
            return existing_endpoints[0].resource_name
    except Exception as e:
        print(f"Info: {e}")

    # Create the endpoint
    print("Creating endpoint (this may take several minutes)...")
    endpoint = aiplatform.MatchingEngineIndexEndpoint.create(
        display_name=endpoint_name,
        description=description,
        public_endpoint_enabled=False,
    )

    print(f"✓ Endpoint created successfully!")
    print(f"Resource Name: {endpoint.resource_name}")

    return endpoint.resource_name


def deploy_index_to_endpoint(
    index_resource_name: str,
    endpoint_resource_name: str,
    deployed_index_id: str = "pavilion_embeddings_v1"
) -> None:
    """
    Deploy index to endpoint for querying.

    Args:
        index_resource_name: Full resource name of the index
        endpoint_resource_name: Full resource name of the endpoint
        deployed_index_id: ID for the deployed index
    """

    print(f"\nDeploying Index to Endpoint...")
    print(f"Deployed Index ID: {deployed_index_id}")

    # Parse resource names to get IDs
    index_id = index_resource_name.split('/')[-1]
    endpoint_id = endpoint_resource_name.split('/')[-1]
    project_id = index_resource_name.split('/')[1]
    location = index_resource_name.split('/')[3]

    # Initialize Vertex AI
    aiplatform.init(project=project_id, location=location)

    # Get the endpoint
    endpoint = aiplatform.MatchingEngineIndexEndpoint(endpoint_resource_name)

    # Check if already deployed
    if any(d.id == deployed_index_id for d in endpoint.deployed_indexes):
        print(f"✓ Index already deployed to endpoint")
        return

    # Deploy
    print("Deploying (this may take 10-30 minutes)...")
    endpoint.deploy_index(
        index=aiplatform.MatchingEngineIndex(index_resource_name),
        id=deployed_index_id,
        display_name="Pavilion Article Embeddings Deployment",
    )

    print(f"✓ Index deployed successfully!")


def main():
    parser = argparse.ArgumentParser(
        description="Setup Vertex AI Vector Search for Pavilion CMS"
    )
    parser.add_argument(
        "--project-id",
        required=False,
        help="GCP Project ID (uses GOOGLE_PROJECT_ID env var if not provided)"
    )
    parser.add_argument(
        "--location",
        default="us-central1",
        help="GCP Region (default: us-central1)"
    )
    parser.add_argument(
        "--index-name",
        default="pavilion-article-embeddings",
        help="Vector Search Index name"
    )
    parser.add_argument(
        "--endpoint-name",
        default="pavilion-search-endpoint",
        help="Vector Search Endpoint name"
    )
    parser.add_argument(
        "--skip-endpoint",
        action="store_true",
        help="Skip endpoint creation (index only)"
    )

    args = parser.parse_args()

    # Get project ID from args or environment
    project_id = args.project_id or os.getenv("GOOGLE_PROJECT_ID")
    if not project_id:
        print("Error: Project ID must be provided via --project-id or GOOGLE_PROJECT_ID env var")
        sys.exit(1)

    try:
        # Create index
        index_resource_name = create_vector_search_index(
            project_id=project_id,
            location=args.location,
            index_name=args.index_name,
        )

        # Create endpoint and deploy index
        if not args.skip_endpoint:
            endpoint_resource_name = create_index_endpoint(
                project_id=project_id,
                location=args.location,
                endpoint_name=args.endpoint_name,
            )

            deploy_index_to_endpoint(
                index_resource_name=index_resource_name,
                endpoint_resource_name=endpoint_resource_name,
            )

        print("\n" + "="*50)
        print("✓ Vector Search Setup Complete!")
        print("="*50)
        print(f"Index Resource: {index_resource_name}")
        if not args.skip_endpoint:
            print(f"Endpoint Resource: {endpoint_resource_name}")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
