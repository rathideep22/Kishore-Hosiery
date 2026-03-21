# Auth endpoint tests
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestAuth:
    """Authentication flow tests"""

    def test_send_otp_success(self, api_client):
        """Test OTP sending for registered user"""
        response = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": "+919999999901"
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["mock_otp"] == "1234"
        print("✓ Send OTP successful")

    def test_send_otp_unregistered_user(self, api_client):
        """Test OTP sending fails for unregistered user"""
        response = api_client.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": "+919999999999"
        })
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()
        print("✓ Unregistered user rejected correctly")

    def test_verify_otp_success(self, api_client):
        """Test OTP verification with correct code"""
        # First send OTP
        api_client.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919999999901"})
        
        # Verify OTP
        response = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": "+919999999901",
            "otp": "1234"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["phone"] == "+919999999901"
        assert data["user"]["role"] == "admin"
        print("✓ OTP verification successful")

    def test_verify_otp_invalid(self, api_client):
        """Test OTP verification with wrong code"""
        api_client.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919999999901"})
        
        response = api_client.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": "+919999999901",
            "otp": "9999"
        })
        assert response.status_code == 400
        data = response.json()
        assert "invalid" in data["detail"].lower()
        print("✓ Invalid OTP rejected correctly")

    def test_get_me_authenticated(self, api_client, auth_headers):
        """Test /auth/me endpoint with valid token"""
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "phone" in data
        assert "role" in data
        assert data["phone"] == "+919999999901"
        print("✓ Get me endpoint working")

    def test_get_me_unauthenticated(self, api_client):
        """Test /auth/me endpoint without token"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Unauthenticated request rejected")
