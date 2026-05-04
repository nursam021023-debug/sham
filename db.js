/**
 * db.js  —  Central Firestore data layer for DA LOCAL
 *
 * Collections used:
 *   customers/{uid}           – customer accounts
 *   sellers/{uid}             – seller accounts
 *   sellerProfiles/{username} – seller profile details
 *   stores/{uid}              – store listing info
 *   products/{auto}           – products (field: seller=username)
 *   orders/{auto}             – all orders (fields: customerUID, sellerUsername, status …)
 *   addresses/{auto}          – delivery addresses (field: customerUID)
 */

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection, doc,
    getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey:            "AIzaSyBaDezXv4aynvYTJaaZyXwIRIImLBEYwB0",
    authDomain:        "dalocal-8ceb3.firebaseapp.com",
    projectId:         "dalocal-8ceb3",
    storageBucket:     "dalocal-8ceb3.appspot.com",
    messagingSenderId: "737186112999",
    appId:             "1:737186112999:web:f61d20523f4ac479f8c942"
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

export async function getCustomer(uid) {
    const snap = await getDoc(doc(db, "customers", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveCustomerProfile(uid, data) {
    await setDoc(doc(db, "customers", uid), data, { merge: true });
}

// ─── SELLERS ──────────────────────────────────────────────────────────────────

export async function getSellerByUsername(username) {
    const snap = await getDocs(query(collection(db, "sellers"), where("username", "==", username)));
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getSellerProfile(username) {
    const snap = await getDoc(doc(db, "sellerProfiles", username));
    return snap.exists() ? snap.data() : {};
}

export async function saveSellerProfile(username, data) {
    await setDoc(doc(db, "sellerProfiles", username), data, { merge: true });
}

// ─── STORES ───────────────────────────────────────────────────────────────────

export async function getAllStores() {
    const snap = await getDocs(collection(db, "stores"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.name && s.seller);
}

export async function getStore(sellerUID) {
    const snap = await getDoc(doc(db, "stores", sellerUID));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveStore(sellerUID, data) {
    await setDoc(doc(db, "stores", sellerUID), data, { merge: true });
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export async function getProductsBySeller(sellerUsername) {
    const snap = await getDocs(query(collection(db, "products"), where("seller", "==", sellerUsername)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addProduct(data) {
    return await addDoc(collection(db, "products"), data);
}

export async function updateProduct(productId, data) {
    await updateDoc(doc(db, "products", productId), data);
}

export async function deleteProduct(productId) {
    await deleteDoc(doc(db, "products", productId));
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

/**
 * Place a new order. Stores into Firestore "orders" collection.
 * @param {Object} orderData - should include: customerUID, customerUsername,
 *   sellerUsername, items[], paymentMethod, address, status, gcashScreenshot?, referenceNum?
 */
export async function placeOrder(orderData) {
    return await addDoc(collection(db, "orders"), {
        ...orderData,
        createdAt: serverTimestamp()
    });
}

/** Get all orders for a customer */
export async function getOrdersByCustomer(customerUID) {
    const snap = await getDocs(query(
        collection(db, "orders"),
        where("customerUID", "==", customerUID)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Get all orders for a seller */
export async function getOrdersBySeller(sellerUsername) {
    const snap = await getDocs(query(
        collection(db, "orders"),
        where("sellerUsername", "==", sellerUsername)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Update an order's status */
export async function updateOrderStatus(orderId, status) {
    await updateDoc(doc(db, "orders", orderId), { status, updatedAt: serverTimestamp() });
}

// ─── ADDRESSES ────────────────────────────────────────────────────────────────

export async function getAddresses(customerUID) {
    const snap = await getDocs(query(collection(db, "addresses"), where("customerUID", "==", customerUID)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveAddress(customerUID, addressData, existingId = null) {
    if (existingId) {
        await setDoc(doc(db, "addresses", existingId), { customerUID, ...addressData }, { merge: true });
        return existingId;
    } else {
        const ref = await addDoc(collection(db, "addresses"), { customerUID, ...addressData });
        return ref.id;
    }
}

export async function deleteAddress(addressId) {
    await deleteDoc(doc(db, "addresses", addressId));
}

export async function setDefaultAddress(customerUID, addressId) {
    // Unset all, then set the chosen one
    const all = await getAddresses(customerUID);
    const batch = all.map(a =>
        updateDoc(doc(db, "addresses", a.id), { isDefault: a.id === addressId })
    );
    await Promise.all(batch);
}

// ─── CART ─────────────────────────────────────────────────────────────────────

export async function getCart(customerUID) {
    const snap = await getDoc(doc(db, "carts", customerUID));
    return snap.exists() ? (snap.data().items || []) : [];
}

export async function saveCart(customerUID, items) {
    await setDoc(doc(db, "carts", customerUID), { items, updatedAt: serverTimestamp() });
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export async function getMessages(customerUsername, sellerUsername) {
    const threadId = [customerUsername, sellerUsername].sort().join("__");
    const snap = await getDocs(query(
        collection(db, "messages"),
        where("threadId", "==", threadId)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sentAt?.seconds || 0) - (b.sentAt?.seconds || 0));
}

export async function sendMessage(customerUsername, sellerUsername, sender, text) {
    const threadId = [customerUsername, sellerUsername].sort().join("__");
    await addDoc(collection(db, "messages"), {
        threadId, customerUsername, sellerUsername,
        sender, text, sentAt: serverTimestamp()
    });
}

export async function getThreadsForSeller(sellerUsername) {
    const snap = await getDocs(query(collection(db, "messages"), where("sellerUsername", "==", sellerUsername)));
    const threads = {};
    snap.docs.forEach(d => {
        const data = d.data();
        if (!threads[data.threadId]) threads[data.threadId] = { ...data, messages: [] };
        threads[data.threadId].messages.push(data);
    });
    return Object.values(threads);
}

export async function getThreadsForCustomer(customerUsername) {
    const snap = await getDocs(query(collection(db, "messages"), where("customerUsername", "==", customerUsername)));
    const threads = {};
    snap.docs.forEach(d => {
        const data = d.data();
        if (!threads[data.threadId]) threads[data.threadId] = { ...data, messages: [] };
        threads[data.threadId].messages.push(data);
    });
    return Object.values(threads);
}

// ─── RATINGS ──────────────────────────────────────────────────────────────────

export async function saveRating(customerUID, sellerUsername, ratingData) {
    await addDoc(collection(db, "ratings"), {
        customerUID, sellerUsername, ...ratingData, ratedAt: serverTimestamp()
    });
}

export async function getRatingsBySeller(sellerUsername) {
    const snap = await getDocs(query(collection(db, "ratings"), where("sellerUsername", "==", sellerUsername)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Cancel an order (sets status to "cancelled") */
export async function cancelOrder(orderId) {
    await updateDoc(doc(db, "orders", orderId), { 
        status: "cancelled", 
        cancelledAt: serverTimestamp() 
    });
}
