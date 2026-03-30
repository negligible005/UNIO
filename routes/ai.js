const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * KNOWLEDGE: A comprehensive static knowledge base for the UNIO Platform.
 * Contains responses for platform features, registration, roles, and troubleshooting.
 * Each entry maps a collection of keywords (keys) to a descriptive response (reply).
 */
const KNOWLEDGE = [
  // Platform overview: General branding and value proposition
  { keys: ['what is unio', 'about unio', 'platform', 'unio app', 'what does unio do'],
    reply: `UNIO is a peer-to-peer resource sharing platform that lets users split costs on logistics, digital subscriptions, cargo, cold storage, and more. You can be a Consumer (find & join splits) or a Provider (list your services). Key areas: Dashboard, Marketplace, Community, and Tracking.` },

  // User Lifecycle: Account creation and session management
  { keys: ['register', 'sign up', 'create account', 'new account'],
    reply: `To register on UNIO: click "Get Started" on the homepage → fill in your name, email, and password → choose your role (Consumer or Provider). You'll be logged in automatically after registration.` },
  { keys: ['login', 'log in', 'sign in', 'forgot password'],
    reply: `To login: go to the Login page and enter your email & password. Your session lasts 1 hour. If you forget your password, contact support — password reset is coming soon.` },

  // Navigation: Guidance for main interface sections
  { keys: ['dashboard', 'home page', 'main page', 'joined splits', 'my splits'],
    reply: `The Dashboard (consumer.html) is your main hub. It shows: Active Splits you've joined, Bookings you've made, Notifications, and quick stats. Use the left sidebar to navigate between sections.` },
  { keys: ['marketplace', 'buy', 'sell', 'browse items', 'find splits', 'explore'],
    reply: `The Marketplace (marketplace.html) lets you browse available splits by category: Logistics 🚚, Digital Subscriptions 💻, Cold Storage ❄️, Cargo 📦, and more. Use filters to narrow by price, type, or location. Click any listing to view details, join, or place a bid.` },

  // Role Specifics: How to operate as a Provider vs Consumer
  { keys: ['create split', 'post listing', 'list service', 'add listing', 'new listing', 'create listing', 'how to list'],
    reply: `As a Provider, go to your Provider Dashboard (provider.html) → click "Create New Listing". Fill in: service type, capacity, price per unit, location & date. Your listing goes to admin for approval before going live. Once approved, consumers can find and book it.` },
  { keys: ['booking', 'book', 'reservation', 'how to book', 'join split'],
    reply: `To book/join a split: browse the Marketplace → click on a listing → select quantity → confirm booking. You'll see the booking in your Dashboard under "My Bookings". Providers will see it and can confirm or manage it.` },

  // Financials & Audit: Payments and transaction security
  { keys: ['payment', 'pay', 'price', 'cost', 'amount', 'inr', 'rupee', 'how much'],
    reply: `All prices on UNIO are in INR (₹). After booking, navigate to "Make Payment" to pay via our dummy payment system. You can use simulated UPI, Card, or Net Banking. A confirmation ID is generated for each payment. Admin can track all payments.` },

  // Reputation & Social: Trust scores and community interactions
  { keys: ['trust', 'trust score', 'rating', 'review', 'reputation'],
    reply: `Trust Scores (1-5 stars) reflect a user's reliability on the platform. After completing a split, you can rate your co-participants. Higher trust scores increase your visibility and credibility. Check any user's trust score on their profile in the Community section.` },
  { keys: ['community', 'friends', 'connect', 'social', 'people', 'users'],
    reply: `The Community section lets you connect with other UNIO members. Send friend requests, see mutual connections, view friend activity, and check peer trust scores. A strong community network improves your recommendations.` },

  // Help & Troubleshooting: Support escalation and technical guidance
  { keys: ['help', 'support', 'problem', 'issue', 'not working', 'error', 'bug'],
    reply: `For platform issues, try: refreshing the page, logging out and back in, or clearing browser cache. For listing/booking disputes, contact your co-participant first. For platform-level issues, reach out to admin via the Admin Panel.` },

  // Social & Greeting: NLP-friendly interaction entry points
  { keys: ['hi', 'hello', 'hey', 'greet', 'good morning', 'good afternoon', 'howdy'],
    reply: `Hello! 👋 I'm the UNIO Assistant. I can help you with:\n• Finding and joining splits\n• Creating listings (providers)\n• Payments & tracking\n• Community & trust scores\n• Platform navigation\n\nWhat would you like to know?` },
];

/**
 * findReply: Search utility for identifying the best-matching response for a query.
 * Uses a greedy overlap match to prioritize more specific keyword hits.
 * @param {string} msg - The raw user message.
 * @returns {string|null} - The matched response string or null if no mapping exists.
 */
function findReply(msg) {
    const lower = msg.toLowerCase().trim();
    let bestMatch = null;
    let maxOverlap = 0;

    // Iterate through the knowledge base to find matches
    for (const item of KNOWLEDGE) {
        for (const key of item.keys) {
            // Check for keyword presence in the message
            if (lower.includes(key)) {
                // High-confidence match (exact string) returns immediately
                if (lower === key) return item.reply;
                
                // Track best match based on key specificity length
                if (key.length > maxOverlap) {
                    maxOverlap = key.length;
                    bestMatch = item.reply;
                }
            }
        }
    }
    return bestMatch;
}

/**
 * POST /api/ai/chat
 * Primary endpoint for the AI-assisted platform guide (Chatbot).
 * Analyzes natural language input and provides contextual help based on the KNOWLEDGE BASE.
 * @requires authenticateToken
 */
router.post('/chat', authenticateToken, async (req, res) => {
    const { message } = req.body;
    // Input validation for empty or null messages
    if (!message || !message.trim()) {
        return res.json({ reply: "Please type a question and I'll do my best to help! 😊" });
    }

    // Identify the best categorized reply from the Knowledge Base
    let reply = findReply(message);

    // Fallback logic for queries that don't meet keyword thresholds
    if (!reply) {
        const lower = message.toLowerCase();
        // Categorize by question type (how/what/where)
        if (lower.includes('how') || lower.includes('what') || lower.includes('where') || lower.includes('when')) {
            reply = `I'm not sure about that specific question, but here are things I can help with:\n• **Joining/creating splits** — ask "how do I join a split?"\n• **Payments** — ask "how does payment work?"\n• **Tracking** — ask "how do I track my shipment?"\n• **Community** — ask "what is the community section?"\n\nTry rephrasing your question or ask about a specific feature!`;
        } else if (lower.includes('price') || lower.includes('cost') || lower.includes('cheap')) {
            reply = `Prices on UNIO vary by listing and are set by providers. All prices are in INR (₹). Splitting a service means you only pay your share — much cheaper than booking alone! Browse the Marketplace to compare prices.`;
        } else {
            // Generic catch-all assistant message
            reply = `I'm your UNIO Assistant 🤖 I can help you navigate the platform, understand features like splits, bookings, tracking, and payments. Try asking:\n• "How do I create a split?"\n• "What is a trust score?"\n• "How does payment work?"\n• "How do I track my shipment?"`;
        }
    }

    // Small simulated processing delay to improve the conversational UX (natural timing)
    setTimeout(() => {
        res.json({ reply });
    }, 300);
});

module.exports = router;
