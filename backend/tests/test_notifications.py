# Notification tests
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestNotifications:
    """Notification system tests"""

    def test_get_notifications(self, api_client, auth_headers):
        """Test fetching notifications list"""
        response = api_client.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} notifications")

    def test_get_unread_count(self, api_client, auth_headers):
        """Test fetching unread notification count"""
        response = api_client.get(f"{BASE_URL}/api/notifications/unread-count", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        assert data["count"] >= 0
        print(f"✓ Unread count: {data['count']}")

    def test_mark_all_read(self, api_client, auth_headers):
        """Test marking all notifications as read"""
        response = api_client.put(f"{BASE_URL}/api/notifications/read-all", headers=auth_headers)
        assert response.status_code == 200
        
        # Verify unread count is now 0
        count_response = api_client.get(f"{BASE_URL}/api/notifications/unread-count", headers=auth_headers)
        count_data = count_response.json()
        assert count_data["count"] == 0
        print("✓ All notifications marked as read")

    def test_notification_created_on_order(self, api_client, auth_headers, staff_headers):
        """Test notification is created when admin creates order"""
        # Get initial staff notification count
        initial_response = api_client.get(f"{BASE_URL}/api/notifications", headers=staff_headers)
        initial_count = len(initial_response.json())
        
        # Admin creates order
        api_client.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "partyName": "TEST_Notification Order",
            "message": "Testing notifications",
            "totalParcels": 10
        })
        
        # Check staff received notification
        final_response = api_client.get(f"{BASE_URL}/api/notifications", headers=staff_headers)
        final_count = len(final_response.json())
        assert final_count > initial_count
        print("✓ Notification created for staff when order created")
