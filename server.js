const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const path = require('path');

const PORT = process.env.PORT || 3000;

// Product database with images and categories
const products = [
  { name: 'Apple', category: 'Fruits', emoji: '🍎', image: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=200&h=200&fit=crop' },
  { name: 'Banana', category: 'Fruits', emoji: '🍌', image: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=200&h=200&fit=crop' },
  { name: 'Orange', category: 'Fruits', emoji: '🍊', image: 'https://images.unsplash.com/photo-1580052614034-c55d20bfee3b?w=200&h=200&fit=crop' },
  { name: 'Dates', category: 'Fruits', emoji: '🫐', image: 'https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?w=200&h=200&fit=crop' },
  { name: 'Tomato', category: 'Vegetables', emoji: '🍅', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&h=200&fit=crop' },
  { name: 'Carrot', category: 'Vegetables', emoji: '🥕', image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=200&h=200&fit=crop' },
  { name: 'Lettuce', category: 'Vegetables', emoji: '🥬', image: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=200&h=200&fit=crop' },
  { name: 'Cabbage', category: 'Vegetables', emoji: '🥬', image: 'https://images.unsplash.com/photo-1594282032252-7901a9a80e5f?w=200&h=200&fit=crop' },
  { name: 'Milk', category: 'Dairy', emoji: '🥛', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=200&h=200&fit=crop' },
  { name: 'Cheese', category: 'Dairy', emoji: '🧀', image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=200&h=200&fit=crop' },
  { name: 'Eggs', category: 'Dairy', emoji: '🥚', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=200&h=200&fit=crop' },
  { name: 'Bread', category: 'Bakery', emoji: '🍞', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=200&fit=crop' },
  { name: 'Chicken', category: 'Meat', emoji: '🍗', image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=200&h=200&fit=crop' },
  { name: 'Beef', category: 'Meat', emoji: '🥩', image: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=200&h=200&fit=crop' },
  { name: 'Fish', category: 'Seafood', emoji: '🐟', image: 'https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=200&h=200&fit=crop' },
  { name: 'Rice', category: 'Grains', emoji: '🍚', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200&h=200&fit=crop' },
  { name: 'Pasta', category: 'Grains', emoji: '🍝', image: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=200&h=200&fit=crop' },
  { name: 'Pizza', category: 'Frozen', emoji: '🍕', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop' },
  { name: 'Water', category: 'Beverages', emoji: '💧', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=200&h=200&fit=crop' },
  { name: 'Juice', category: 'Beverages', emoji: '🧃', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=200&h=200&fit=crop' }
];

// Store state - inventory is now an object with quantities
let inventory = {};  // { itemName: quantity }
let transactions = [];
let shoppers = [];

app.use(express.static('public'));

// Serve HTML files
app.get('/stocker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stocker.html'));
});

app.get('/shopper1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shopper1.html'));
});

app.get('/shopper2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shopper2.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get products
app.get('/api/products', (req, res) => {
  res.json(products);
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send current state
  socket.emit('inventory-update', inventory);
  socket.emit('shoppers-update', shoppers);
  transactions.forEach(t => socket.emit('transaction-added', t));

  // Register shopper
  socket.on('register-shopper', (data) => {
    const { name, type } = data;
    const existingIndex = shoppers.findIndex(s => s.type === type);
    
    if (existingIndex >= 0) {
      shoppers[existingIndex].name = name;
      shoppers[existingIndex].cart = [];
    } else {
      shoppers.push({ name, type, cart: [] });
    }
    
    io.emit('shoppers-update', shoppers);
  });

  // Add item with quantity
  socket.on('add-item', (data) => {
    const { item, quantity } = data;
    const qty = parseInt(quantity) || 1;

    // Check if adding this would exceed 8 unique items
    const uniqueItems = Object.keys(inventory).length;
    if (!inventory[item] && uniqueItems >= 8) {
      socket.emit('error', 'Inventory full! Maximum 8 different items allowed.');
      return;
    }

    // Add or update quantity
    if (inventory[item]) {
      inventory[item] += qty;
    } else {
      inventory[item] = qty;
    }

    const transaction = {
      type: 'put',
      user: 'Manager',
      item: item,
      quantity: qty,
      timestamp: new Date()
    };
    transactions.push(transaction);

    io.emit('inventory-update', inventory);
    io.emit('transaction-added', transaction);
  });

  // Purchase item
  socket.on('purchase-item', (data) => {
    const { shopper, item, quantity } = data;
    const qty = parseInt(quantity) || 1;

    if (!inventory[item] || inventory[item] < qty) {
      socket.emit('error', `Not enough ${item} in stock`);
      return;
    }

    // Decrease inventory
    inventory[item] -= qty;
    if (inventory[item] === 0) {
      delete inventory[item];
    }

    // Update shopper cart
    const shopperIndex = shoppers.findIndex(s => s.name === shopper);
    if (shopperIndex >= 0) {
      const existingItem = shoppers[shopperIndex].cart.find(c => c.item === item);
      if (existingItem) {
        existingItem.quantity += qty;
      } else {
        shoppers[shopperIndex].cart.push({ item, quantity: qty });
      }
    }

    const transaction = {
      type: 'get',
      user: shopper,
      item: item,
      quantity: qty,
      timestamp: new Date()
    };
    transactions.push(transaction);

    io.emit('inventory-update', inventory);
    io.emit('shoppers-update', shoppers);
    io.emit('transaction-added', transaction);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Stocker: http://localhost:${PORT}/stocker`);
  console.log(`Shopper 1: http://localhost:${PORT}/shopper1`);
  console.log(`Shopper 2: http://localhost:${PORT}/shopper2`);
});
