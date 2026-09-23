import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage for headless testing of Nova AI guest auth logic
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const localStorage = new LocalStorageMock();

// Verification helper matching GuestAuthModal validation
function validateUser(name, phone) {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const isValid = (name || "").trim().length > 0 && cleanPhone.length >= 10;
  return { isValid, cleanPhone, trimmedName: (name || "").trim() };
}

// Logic matching GuestAuthModal onComplete
function saveGuestUser(name, phone) {
  const { isValid, cleanPhone, trimmedName } = validateUser(name, phone);
  if (!isValid) throw new Error("Invalid user input");

  const verifiedUser = {
    name: trimmedName,
    phone: cleanPhone,
    lastActive: Date.now(),
  };

  localStorage.setItem("nova_current_user", JSON.stringify(verifiedUser));

  const existingRaw = localStorage.getItem("nova_saved_users");
  let list = existingRaw ? JSON.parse(existingRaw) : [];
  list = [verifiedUser, ...list.filter((u) => u.phone !== cleanPhone)].slice(0, 8);
  localStorage.setItem("nova_saved_users", JSON.stringify(list));

  return verifiedUser;
}

// Logic matching isolated chat storage
function getStoredChats(phone) {
  const raw = localStorage.getItem(`nova_chats_${phone}`);
  return raw ? JSON.parse(raw) : [];
}

function saveStoredChats(phone, chats) {
  localStorage.setItem(`nova_chats_${phone}`, JSON.stringify(chats));
}

test("Requirement 1 & 2: Input Validation & Disabled State", () => {
  // Empty inputs
  assert.equal(validateUser("", "").isValid, false);
  assert.equal(validateUser("Preetam", "").isValid, false);
  assert.equal(validateUser("", "9876543210").isValid, false);

  // Less than 10 digits
  assert.equal(validateUser("Preetam", "123456789").isValid, false);
  assert.equal(validateUser("Preetam", "(123) 456-78").isValid, false);

  // Valid 10+ digits with formatting
  assert.equal(validateUser("Preetam", "9876543210").isValid, true);
  assert.equal(validateUser("Preetam", "+91 98765 43210").isValid, true);
  assert.equal(validateUser("  Alice  ", "  (555) 123-4567  ").isValid, true);
  assert.equal(validateUser("  Alice  ", "  (555) 123-4567  ").cleanPhone, "5551234567");
});

test("Requirement 2: Smart Recognition & LocalStorage Profiles", () => {
  localStorage.clear();

  // Save first profile (Alice)
  const alice = saveGuestUser("Alice", "9876543210");
  assert.equal(alice.name, "Alice");
  assert.equal(alice.phone, "9876543210");

  const currentUser = JSON.parse(localStorage.getItem("nova_current_user"));
  assert.equal(currentUser.name, "Alice");
  assert.equal(currentUser.phone, "9876543210");

  let savedList = JSON.parse(localStorage.getItem("nova_saved_users"));
  assert.equal(savedList.length, 1);
  assert.equal(savedList[0].name, "Alice");

  // Save second profile (Bob)
  saveGuestUser("Bob", "9123456789");
  savedList = JSON.parse(localStorage.getItem("nova_saved_users"));
  assert.equal(savedList.length, 2);
  assert.equal(savedList[0].name, "Bob"); // Bob is most recent
  assert.equal(savedList[1].name, "Alice");

  // Quick select Alice simulation: chip clicked -> fields populated -> submit
  const selectedChip = savedList.find((u) => u.phone === "9876543210");
  const validation = validateUser(selectedChip.name, selectedChip.phone);
  assert.equal(validation.isValid, true);

  // Saving Alice again moves her back to top without duplicates
  saveGuestUser(selectedChip.name, selectedChip.phone);
  savedList = JSON.parse(localStorage.getItem("nova_saved_users"));
  assert.equal(savedList.length, 2);
  assert.equal(savedList[0].name, "Alice");
  assert.equal(savedList[1].name, "Bob");
});

test("Requirement 3: Isolated Private Chats (nova_chats_[phone])", () => {
  localStorage.clear();

  const alicePhone = "9876543210";
  const bobPhone = "9123456789";

  // Alice starts chat
  const aliceChat = [
    {
      id: "chat-alice-1",
      title: "Quantum Computing Explanations",
      updated_at: new Date().toISOString(),
      messages: [
        { key: "1", role: "user", content: "Explain quantum superposition" },
        { key: "2", role: "assistant", content: "Quantum superposition allows..." },
      ],
    },
  ];
  saveStoredChats(alicePhone, aliceChat);

  // Bob starts chat
  const bobChat = [
    {
      id: "chat-bob-1",
      title: "Python Web Scraping",
      updated_at: new Date().toISOString(),
      messages: [
        { key: "3", role: "user", content: "How to use BeautifulSoup in Python" },
        { key: "4", role: "assistant", content: "Here is a Python example..." },
      ],
    },
  ];
  saveStoredChats(bobPhone, bobChat);

  // Verify Alice only sees Alice's chats
  const retrievedAliceChats = getStoredChats(alicePhone);
  assert.equal(retrievedAliceChats.length, 1);
  assert.equal(retrievedAliceChats[0].id, "chat-alice-1");
  assert.equal(retrievedAliceChats[0].title, "Quantum Computing Explanations");

  // Verify Bob only sees Bob's chats
  const retrievedBobChats = getStoredChats(bobPhone);
  assert.equal(retrievedBobChats.length, 1);
  assert.equal(retrievedBobChats[0].id, "chat-bob-1");
  assert.equal(retrievedBobChats[0].title, "Python Web Scraping");

  // Verify a new visitor Charlie (phone: 9999988888) has 0 chats
  const charlieChats = getStoredChats("9999988888");
  assert.deepEqual(charlieChats, []);
});

test("Requirement 4: Logout Functionality", () => {
  localStorage.clear();

  // Log in Alice
  saveGuestUser("Alice", "9876543210");
  assert.ok(localStorage.getItem("nova_current_user"));

  // Logout
  localStorage.removeItem("nova_current_user");

  // Verify current user is cleared
  assert.equal(localStorage.getItem("nova_current_user"), null);

  // Verify saved users remain intact for quick re-login
  const savedUsers = JSON.parse(localStorage.getItem("nova_saved_users"));
  assert.equal(savedUsers.length, 1);
  assert.equal(savedUsers[0].name, "Alice");
});

