# Order CRUD and status tests
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestOrders:
    """Order CRUD operations"""
    
    created_order_id = None

    def test_create_order_admin(self, api_client, auth_headers):
        """Test order creation by admin"""
        response = api_client.post(f"{BASE_URL}/api/orders", headers=auth_headers, json={
            "partyName": "TEST_Automation Traders",
            "message": "Test order for automation",
            "totalParcels": 50
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "orderId" in data
        assert data["partyName"] == "TEST_Automation Traders"
        assert data["totalParcels"] == 50
        assert data["readinessStatus"] == "Pending"
        assert data["dispatched"] == False
        
        # Store for later tests
        TestOrders.created_order_id = data["id"]
        print(f"✓ Order created: {data['orderId']}")

    def test_create_order_staff_forbidden(self, api_client, staff_headers):
        """Test order creation by staff should fail"""
        response = api_client.post(f"{BASE_URL}/api/orders", headers=staff_headers, json={
            "partyName": "TEST_Staff Order",
            "message": "Should fail",
            "totalParcels": 10
        })
        assert response.status_code == 403
        print("✓ Staff correctly forbidden from creating orders")

    def test_get_orders_list(self, api_client, auth_headers):
        """Test fetching orders list"""
        response = api_client.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Retrieved {len(data)} orders")

    def test_get_orders_with_filter_pending(self, api_client, auth_headers):
        """Test orders list with pending filter"""
        response = api_client.get(f"{BASE_URL}/api/orders?status=pending", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for order in data:
            assert order["readinessStatus"] == "Pending"
            assert order["dispatched"] == False
        print(f"✓ Pending filter working: {len(data)} orders")

    def test_get_orders_with_search(self, api_client, auth_headers):
        """Test orders search functionality"""
        response = api_client.get(f"{BASE_URL}/api/orders?search=Automation", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert any("Automation" in order["partyName"] for order in data)
        print(f"✓ Search working: {len(data)} results")

    def test_get_order_by_id(self, api_client, auth_headers):
        """Test fetching single order and verify persistence"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == TestOrders.created_order_id
        assert data["partyName"] == "TEST_Automation Traders"
        assert data["totalParcels"] == 50
        print("✓ Order retrieved and data persisted correctly")

    def test_update_order(self, api_client, auth_headers):
        """Test updating order details"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", 
            headers=auth_headers, json={
                "partyName": "TEST_Updated Traders",
                "totalParcels": 60
            })
        assert response.status_code == 200
        data = response.json()
        assert data["partyName"] == "TEST_Updated Traders"
        assert data["totalParcels"] == 60
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["partyName"] == "TEST_Updated Traders"
        assert get_data["totalParcels"] == 60
        print("✓ Order updated and changes persisted")

    def test_toggle_invoice(self, api_client, auth_headers):
        """Test toggling invoice status"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        # Toggle to true
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}/invoice", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["invoiceGiven"] == True
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert get_response.json()["invoiceGiven"] == True
        print("✓ Invoice toggle working and persisted")

    def test_toggle_transport_slip(self, api_client, auth_headers):
        """Test toggling transport slip status"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}/transport-slip", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["transportSlip"] == True
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert get_response.json()["transportSlip"] == True
        print("✓ Transport slip toggle working and persisted")

    def test_add_godown_entry(self, api_client, auth_headers):
        """Test adding godown distribution entry"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}/godown",
            headers=auth_headers, json={
                "godown": "G1",
                "readyParcels": 30
            })
        assert response.status_code == 200
        data = response.json()
        assert len(data["godownDistribution"]) > 0
        assert data["godownDistribution"][0]["godown"] == "G1"
        assert data["godownDistribution"][0]["readyParcels"] == 30
        assert data["readinessStatus"] == "Partial Ready"
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        get_data = get_response.json()
        assert len(get_data["godownDistribution"]) > 0
        assert get_data["readinessStatus"] == "Partial Ready"
        print("✓ Godown entry added and status updated correctly")

    def test_godown_ready_status(self, api_client, auth_headers):
        """Test order becomes Ready when all parcels accounted"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        # Add remaining parcels
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}/godown",
            headers=auth_headers, json={
                "godown": "G2",
                "readyParcels": 30
            })
        assert response.status_code == 200
        data = response.json()
        assert data["readinessStatus"] == "Ready"
        print("✓ Order status changed to Ready when all parcels ready")

    def test_toggle_dispatch(self, api_client, auth_headers):
        """Test marking order as dispatched"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.put(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}/dispatch", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["dispatched"] == True
        assert "dispatchedAt" in data
        assert data["dispatchedAt"] is not None
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        get_data = get_response.json()
        assert get_data["dispatched"] == True
        print("✓ Order dispatched successfully")

    def test_delete_order(self, api_client, auth_headers):
        """Test deleting order and verify it's gone"""
        if not TestOrders.created_order_id:
            pytest.skip("No order created yet")
        
        response = api_client.delete(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert response.status_code == 200
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/orders/{TestOrders.created_order_id}", headers=auth_headers)
        assert get_response.status_code == 404
        print("✓ Order deleted and verified gone")
