import requests

API_KEY = "nCMF6oA3GhWV67H44OEn"
WORKSPACE = "ffotatoff"
PROJECT = "visible-injury-baseline-1786672508728"  # Replace with your actual project
VERSION = 1  # Usually 1, 2, 3, etc.

url = f"https://api.roboflow.com/{WORKSPACE}/{PROJECT}/{VERSION}"

payload = {
    "api_key": API_KEY,
    "image": "https://media.roboflow.com/fruit.jpg"
}

response = requests.post(url, json=payload, timeout=30)
print("Status:", response.status_code)
print("Response:", response.text[:500])