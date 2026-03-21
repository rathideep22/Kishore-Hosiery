# Dashboard and stats tests
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestDashboard:
    """Dashboard statistics tests"""

    def test_get_dashboard_stats(self, api_client, auth_headers):
        """Test dashboard stats endpoint"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required fields
        assert "totalActive" in data
        assert "ready" in data
        assert "partialReady" in data
        assert "pending" in data
        assert "dispatchedToday" in data
        assert "noInvoice" in data
        assert "noTransport" in data
        
        # Verify all are integers
        for key, value in data.items():
            assert isinstance(value, int)
            assert value >= 0
        
        print(f"✓ Dashboard stats: Active={data['totalActive']}, Ready={data['ready']}, Pending={data['pending']}")

    def test_dashboard_stats_staff_access(self, api_client, staff_headers):
        """Test staff can access dashboard stats"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/stats", headers=staff_headers)
        assert response.status_code == 200
        print("✓ Staff can access dashboard stats")

    def test_audit_logs_admin_only(self, api_client, auth_headers, staff_headers):
        """Test audit logs are admin-only"""
        # Admin should succeed
        admin_response = api_client.get(f"{BASE_URL}/api/audit-logs", headers=auth_headers)
        assert admin_response.status_code == 200
        data = admin_response.json()
        assert isinstance(data, list)
        print(f"✓ Admin can access audit logs: {len(data)} entries")
        
        # Staff should fail
        staff_response = api_client.get(f"{BASE_URL}/api/audit-logs", headers=staff_headers)
        assert staff_response.status_code == 403
        print("✓ Staff correctly forbidden from audit logs")
