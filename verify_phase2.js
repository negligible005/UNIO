const API_URL = 'http://localhost:3000/api';

async function runVerification() {
    try {
        console.log("Starting Phase 2 Verification...");

        // Helper for fetch
        const post = async (url, body, token) => {
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Request failed: ${res.status} ${txt}`);
            }
            return res.json();
        };

        const get = async (url, token) => {
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(url, { headers });
            return res.json();
        };

        // 1. Register Provider
        console.log("Registering Provider...");
        const providerEmail = `provider_${Date.now()}@test.com`;
        const providerData = await post(`${API_URL}/auth/register`, {
            name: "Provider Test",
            email: providerEmail,
            password: "password123"
        });
        const providerToken = providerData.token;
        console.log("Provider Registered.");

        // 2. Register Consumer
        console.log("Registering Consumer...");
        const consumerEmail = `consumer_${Date.now()}@test.com`;
        const consumerData = await post(`${API_URL}/auth/register`, {
            name: "Consumer Test",
            email: consumerEmail,
            password: "password123"
        });
        const consumerToken = consumerData.token;
        console.log("Consumer Registered.");

        // 3. Create Listing
        console.log("Creating Listing...");
        const listingData = await post(`${API_URL}/listings`, {
            type: "cargo_split",
            capacity: "100kg",
            price_per_unit: 10,
            location: "Test Location",
            date: "Tomorrow",
            details: {}
        }, providerToken);
        const listingId = listingData.id;
        console.log(`Listing Created. ID: ${listingId}, Capacity: ${listingData.capacity}`);

        // 4. Consumer Books Listing
        console.log("Booking 20kg...");
        const bookData = await post(`${API_URL}/bookings`, {
            listing_id: listingId,
            quantity: 20
        }, consumerToken);
        console.log("Booking Successful.", bookData);

        // 5. Verify Remaining Capacity
        console.log("Verifying Inventory...");
        const listings = await get(`${API_URL}/listings`);
        const updatedListing = listings.find(l => l.id === listingId);

        if (updatedListing.capacity === "80kg") {
            console.log("SUCCESS: Capacity reduced correctly to 80kg.");
        } else {
            console.error(`FAILURE: Capacity is ${updatedListing.capacity}, expected 80kg.`);
            process.exit(1);
        }

    } catch (error) {
        console.error("Verification Failed:", error.message);
        process.exit(1);
    }
}

runVerification();
