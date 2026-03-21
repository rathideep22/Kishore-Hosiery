import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def admin_token(api_client):
    """Get admin token for authenticated requests"""
    # Send OTP
    api_client.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919999999901"})
    # Verify OTP
    response = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": "+919999999901",
        "otp": "1234"
    })
    data = response.json()
    return data["token"]

@pytest.fixture(scope="session")
def staff_token(api_client):
    """Get staff token for role-based testing"""
    # Send OTP
    api_client.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919999999903"})
    # Verify OTP
    response = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "phone": "+919999999903",
        "otp": "1234"
    })
    data = response.json()
    return data["token"]

@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin authorization"""
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def staff_headers(staff_token):
    """Headers with staff authorization"""
    return {"Authorization": f"Bearer {staff_token}"}
