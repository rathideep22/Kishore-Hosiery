# User management tests
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestUsers:
    """User management operations"""
    
    created_user_id = None

    def test_get_users_admin(self, api_client, auth_headers):
        """Test admin can list users"""
        response = api_client.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # At least 3 seeded users
        print(f"✓ Retrieved {len(data)} users")

    def test_get_users_staff_forbidden(self, api_client, staff_headers):
        """Test staff cannot list users"""
        response = api_client.get(f"{BASE_URL}/api/users", headers=staff_headers)
        assert response.status_code == 403
        print("✓ Staff correctly forbidden from listing users")

    def test_create_user(self, api_client, auth_headers):
        """Test creating new user"""
        response = api_client.post(f"{BASE_URL}/api/users", headers=auth_headers, json={
            "phone": "+919999999999",
            "firstName": "TEST_Auto",
            "lastName": "User",
            "role": "staff"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["phone"] == "+919999999999"
        assert data["firstName"] == "TEST_Auto"
        assert data["role"] == "staff"
        
        TestUsers.created_user_id = data["id"]
        print(f"✓ User created: {data['firstName']} {data['lastName']}")

    def test_create_user_duplicate_phone(self, api_client, auth_headers):
        """Test creating user with duplicate phone fails"""
        response = api_client.post(f"{BASE_URL}/api/users", headers=auth_headers, json={
            "phone": "+919999999901",  # Existing admin phone
            "firstName": "Duplicate",
            "lastName": "User",
            "role": "staff"
        })
        assert response.status_code == 400
        data = response.json()
        assert "already registered" in data["detail"].lower()
        print("✓ Duplicate phone rejected correctly")

    def test_verify_user_persistence(self, api_client, auth_headers):
        """Test created user appears in users list"""
        if not TestUsers.created_user_id:
            pytest.skip("No user created yet")
        
        response = api_client.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        user_found = any(u["id"] == TestUsers.created_user_id for u in data)
        assert user_found
        print("✓ Created user persisted in database")

    def test_delete_user(self, api_client, auth_headers):
        """Test deleting user and verify it's gone"""
        if not TestUsers.created_user_id:
            pytest.skip("No user created yet")
        
        response = api_client.delete(f"{BASE_URL}/api/users/{TestUsers.created_user_id}", headers=auth_headers)
        assert response.status_code == 200
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/users", headers=auth_headers)
        users = get_response.json()
        user_exists = any(u["id"] == TestUsers.created_user_id for u in users)
        assert not user_exists
        print("✓ User deleted and verified gone")

    def test_delete_admin_forbidden(self, api_client, auth_headers):
        """Test cannot delete admin users"""
        # Get admin user ID
        response = api_client.get(f"{BASE_URL}/api/users", headers=auth_headers)
        users = response.json()
        admin_user = next(u for u in users if u["role"] == "admin")
        
        delete_response = api_client.delete(f"{BASE_URL}/api/users/{admin_user['id']}", headers=auth_headers)
        assert delete_response.status_code == 400
        data = delete_response.json()
        assert "cannot delete admin" in data["detail"].lower()
        print("✓ Admin deletion correctly prevented")
