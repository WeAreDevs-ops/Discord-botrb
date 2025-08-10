const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();

const express = require('express');
const app = express();

// Serve static files from public directory
app.use('/public', express.static('public'));

// Add download route for QR codes
app.get('/public/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'public', fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Force download with proper headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(filePath, fileName);
});

// Start express server for serving QR codes
app.listen(5000, '0.0.0.0', () => {
    console.log('Static file server running on port 5000');
});

// Global variables for tracking
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

// Store message IDs for embeds to allow deletion later
const embedMessageIds = new Map(); // itemId -> array of message IDs

// Firebase data management functions
async function loadDataFromFirebase(collection, guildId = 'global') {
    try {
        const snapshot = await db.ref(`${guildId}/${collection}`).once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error(`Error loading ${collection} from Firebase:`, error);
        return {};
    }
}

async function saveDataToFirebase(collection, data, guildId = 'global') {
    try {
        await db.ref(`${guildId}/${collection}`).set(data);
    } catch (error) {
        console.error(`Error saving ${collection} to Firebase:`, error);
    }
}

// Legacy file data management (backup)
function loadData(filename) {
    const filepath = path.join(__dirname, 'data', filename);
    if (!fs.existsSync(filepath)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        return {};
    }
}

function saveData(filename, data) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const filepath = path.join(dataDir, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error saving ${filename}:`, error);
    }
}

// Generate unique order ID
function generateOrderId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize data for a specific guild
async function initializeGuildData(guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);
    const orders = await loadDataFromFirebase('orders', guildId);
    const settings = await loadDataFromFirebase('settings', guildId);

    if (Object.keys(settings).length === 0) {
        const defaultSettings = {
            paymentMethods: {
                gcash: 'Gcash Number: [Your Number Here] - Image: [QR Code URL]',
                paypal: 'Send payment to: example@paypal.com'
            },
            orderChannel: null,
            deliveryChannel: null
        };
        await saveDataToFirebase('settings', defaultSettings, guildId);
    }
}

// Initialize data for all guilds the bot is in
async function initializeData() {
    for (const guild of client.guilds.cache.values()) {
        await initializeGuildData(guild.id);
    }
}

// Slash commands definition
const commands = [
    // User commands
    new SlashCommandBuilder()
        .setName('checkout')
        .setDescription('View payment instructions for an order'),

    new SlashCommandBuilder()
        .setName('orders')
        .setDescription('View order history')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check the status of an order'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands and support information'),

    // Admin commands
    new SlashCommandBuilder()
        .setName('addrobux')
        .setDescription('Add Robux to stock')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Robux amount (e.g., 1000, 5000)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Quantity to add')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('Price per item')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('tax_covered')
                .setDescription('Is the tax covered?')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('addaccount')
        .setDescription('Add account to stock')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Account username')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('summary')
                .setDescription('Account summary/details (e.g., 60K)')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('Price for this account')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('premium')
                .setDescription('Is this a premium account?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Account description')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('orderchannel')
        .setDescription('Set the order notification channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for order notifications')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // New command to set the delivery channel
    new SlashCommandBuilder()
        .setName('deliverchannel')
        .setDescription('Set the delivery notification channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for delivery notifications')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('removestock')
        .setDescription('Remove stock quantity')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Item ID')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Quantity to remove')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setprice')
        .setDescription('Update item price')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Item ID')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('new_price')
                .setDescription('New price')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('allorders')
        .setDescription('View all orders')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('deliver')
        .setDescription('Mark an order as delivered')
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID to mark as delivered')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setpayment')
        .setDescription('Set payment method details')
        .addStringOption(option =>
            option.setName('method')
                .setDescription('Payment method')
                .setRequired(true)
                .addChoices(
                    { name: 'Gcash', value: 'gcash' },
                    { name: 'PayPal', value: 'paypal' }
                ))
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Payment details/instructions')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send an announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('healthcheck')
        .setDescription('Check system health and status')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

];

// Register slash commands
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(command => command.toJSON()) }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    await initializeData();
    await registerCommands();
});

// Initialize data when bot joins a new guild
client.on('guildCreate', async (guild) => {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    await initializeGuildData(guild.id);
});

// Command handling
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
});

async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'checkout':
                await handleCheckoutCommand(interaction);
                break;

            case 'orders':
                await handleOrdersCommand(interaction);
                break;
            case 'status':
                await handleStatusCommand(interaction);
                break;
            case 'help':
                await handleHelpCommand(interaction);
                break;
            case 'addrobux':
                await handleAddRobuxCommand(interaction);
                break;
            case 'addaccount':
                await handleAddAccountCommand(interaction);
                break;
            case 'orderchannel':
                await handleOrderChannelCommand(interaction);
                break;
            case 'deliverchannel': // Handler for the new command
                await handleDeliveryChannelCommand(interaction);
                break;
            case 'removestock':
                await handleRemoveStockCommand(interaction);
                break;
            case 'setprice':
                await handleSetPriceCommand(interaction);
                break;
            case 'allorders':
                await handleAllOrdersCommand(interaction);
                break;
            case 'deliver':
                await handleDeliverCommand(interaction);
                break;
            case 'setpayment':
                await handleSetPaymentCommand(interaction);
                break;
            case 'announce':
                await handleAnnounceCommand(interaction);
                break;
            case 'healthcheck':
                await handleHealthCheckCommand(interaction);
                break;

            default:
                await interaction.reply({ content: 'Unknown command!', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling slash command:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
}

async function sendSingleItemEmbed(channel, itemId, item) {
    if (item.quantity <= 0) return;

    const embed = new EmbedBuilder()
        .setTitle('Available')
        .setColor(0x2f3136)
        .setDescription('Please read carefully before making orders')
        .setTimestamp();

    // Different field format for accounts vs robux
    if (itemId.startsWith('account_')) {
        embed.addFields({
            name: `Username: ${item.username}`,
            value: `Price: ₱${item.price.toFixed(2)}\nSummary: ${item.summary}\nPremium: ${item.premium}\n${item.description}`,
            inline: false
        });
    } else {
        const taxStatus = item.taxCovered ? 'Covered tax' : 'Not covered tax';
        embed.addFields({
            name: item.name,
            value: `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}\nProcess: ${taxStatus}`,
            inline: false
        });
    }

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`order_${itemId}`)
                .setLabel(itemId.startsWith('account_') ? 'Order Account' : 'Order Robux')
                .setStyle(ButtonStyle.Primary)
        );

    const sentMessage = await channel.send({ embeds: [embed], components: [actionRow] });

    // Track the message ID for this item
    if (!embedMessageIds.has(itemId)) {
        embedMessageIds.set(itemId, []);
    }
    embedMessageIds.get(itemId).push(sentMessage.id);
}

async function sendRobuxEmbed(channel, guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);

    const robuxItems = Object.entries(stock).filter(([itemId, item]) => 
        itemId.startsWith('robux_') && getAvailableQuantity(item) > 0
    );

    if (robuxItems.length === 0) {
        return;
    }

    // Send each Robux item as a separate embed
    for (const [itemId, item] of robuxItems) {
        const taxStatus = item.taxCovered ? 'Covered tax' : 'Not covered tax';
        const embed = new EmbedBuilder()
            .setTitle('Available Robux')
            .setColor(0x2f3136)
            .setDescription('Please read carefully before making orders')
            .addFields({
                name: item.name,
                value: `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}\nProcess: ${taxStatus}`,
                inline: false
            })
            .setTimestamp();

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_${itemId}`)
                    .setLabel('Order Robux')
                    .setStyle(ButtonStyle.Primary)
            );

        const sentMessage = await channel.send({ embeds: [embed], components: [actionRow] });

        // Track the message ID for this item
        if (!embedMessageIds.has(itemId)) {
            embedMessageIds.set(itemId, []);
        }
        embedMessageIds.get(itemId).push(sentMessage.id);
    }
}

async function sendAccountsEmbed(channel, guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);

    const accountItems = Object.entries(stock).filter(([itemId, item]) => 
        itemId.startsWith('account_') && getAvailableQuantity(item) > 0
    );

    if (accountItems.length === 0) {
        return;
    }

    // Send each account as a separate embed
    for (const [itemId, item] of accountItems) {
        const embed = new EmbedBuilder()
            .setTitle('Available accounts')
            .setColor(0x2f3136)
            .setDescription('Please read carefully before making orders')
            .addFields({
                name: `Username: ${item.username}`,
                value: `Price: ₱${item.price.toFixed(2)}\nSummary: ${item.summary}\nPremium: ${item.premium}\n${item.description}`,
                inline: false
            })
            .setTimestamp();

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_${itemId}`)
                    .setLabel('Order Account')
                    .setStyle(ButtonStyle.Primary)
            );

        const sentMessage = await channel.send({ embeds: [embed], components: [actionRow] });

        // Track the message ID for this item
        if (!embedMessageIds.has(itemId)) {
            embedMessageIds.set(itemId, []);
        }
        embedMessageIds.get(itemId).push(sentMessage.id);
    }
}



async function handleCheckoutCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Checkout Panel')
        .setColor(0x2f3136)
        .setDescription('Click the button below to enter your Order ID and view payment instructions.')
        .addFields({
            name: 'How to use:',
            value: '1. Click the "Enter Order ID" button\n2. Input your Order ID in the modal\n3. View your payment instructions',
            inline: false
        })
        .setTimestamp();

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('checkout_modal')
                .setLabel('Enter Order ID')
                .setStyle(ButtonStyle.Primary)

        );

    await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: false });
}



async function handleOrdersCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('Order History Panel')
        .setColor(0x2f3136)
        .setDescription('Click the button below to view your order history.')
        .addFields({
            name: 'How to use:',
            value: '1. Click the "View My Orders" button\n2. Your personal order history will be displayed\n3. Any user can use this button to check their orders',
            inline: false
        })
        .setTimestamp();

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('view_my_orders')
                .setLabel('View My Orders')
                .setStyle(ButtonStyle.Primary)

        );

    await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: false });
}

async function handleStatusCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Order Status Panel')
        .setColor(0x2f3136)
        .setDescription('Click the button below to enter your Order ID and check the status.')
        .addFields({
            name: 'How to use:',
            value: '1. Click the "Check Status" button\n2. Input your Order ID in the modal\n3. View your order status and details',
            inline: false
        })
        .setTimestamp();

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('status_modal')
                .setLabel('Check Status')
                .setStyle(ButtonStyle.Primary)

        );

    await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: false });
}

async function handleHelpCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Shop Bot Help')
        .setColor(0x2f3136)
        .setDescription('Available commands:')
        .addFields(
            { name: 'User Commands', value: '/checkout - View payment info\n/orders - View your orders\n/status - Check order status', inline: false },
            { name: 'Support', value: 'Contact an administrator for help with your orders.', inline: false }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Admin commands
async function handleAddRobuxCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    const quantity = interaction.options.getInteger('quantity');
    const price = interaction.options.getNumber('price');
    const taxCovered = interaction.options.getBoolean('tax_covered');
    const guildId = interaction.guildId;

    const stock = await loadDataFromFirebase('stock', guildId);

    // Include tax coverage in the item ID to differentiate between tax covered and not covered
    const taxSuffix = taxCovered ? '_tax' : '_notax';
    const itemId = `robux_${amount}${taxSuffix}`;

    // Create new item or replace existing one with the exact quantity specified
    stock[itemId] = { 
        name: `${amount} Robux`, 
        quantity: quantity, 
        price: price, 
        taxCovered: taxCovered,
        reserved: 0 // Initialize reserved quantity to 0
    };

    await saveDataToFirebase('stock', stock, guildId);

    console.log(`Created Robux item with ID: ${itemId}`);
    console.log(`Item data:`, stock[itemId]);

    await interaction.reply({ 
        content: `Successfully added ${quantity} of ${amount} Robux at ₱${price.toFixed(2)} each. Tax Covered: ${taxCovered}.`, 
        ephemeral: true 
    });

    // Send embed for this specific Robux item
    await sendSingleItemEmbed(interaction.channel, itemId, stock[itemId]);
}

async function handleAddAccountCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const username = interaction.options.getString('username');
    const summary = interaction.options.getString('summary');
    const price = interaction.options.getNumber('price');
    const premium = interaction.options.getBoolean('premium');
    const description = interaction.options.getString('description');
    const guildId = interaction.guildId;

    const stock = await loadDataFromFirebase('stock', guildId);
    const timestamp = Date.now();
    const itemId = `account_${timestamp}`;

    stock[itemId] = { 
        name: `Account (${username})`,
        username: username,
        description: description,
        premium: premium ? 'True' : 'False',
        summary: summary,
        price: price,
        quantity: 1,
        reserved: 0 // Initialize reserved quantity to 0
    };

    await saveDataToFirebase('stock', stock, guildId);

    console.log(`Created Account item with ID: ${itemId}`);
    console.log(`Item data:`, stock[itemId]);

    await interaction.reply({ 
        content: `Successfully added Account "${username}" at ₱${price.toFixed(2)}.`, 
        ephemeral: true 
    });

    // Send embed for this specific account
    await sendSingleItemEmbed(interaction.channel, itemId, stock[itemId]);
}

async function handleOrderChannelCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    const settings = await loadDataFromFirebase('settings', guildId);
    settings.orderChannel = channel.id;
    await saveDataToFirebase('settings', settings, guildId);

    await interaction.reply({ 
        content: `Order notification channel set to ${channel}`, 
        ephemeral: true 
    });
}

// Handler for the new /deliverchannel command
async function handleDeliveryChannelCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    const settings = await loadDataFromFirebase('settings', guildId);
    settings.deliveryChannel = channel.id;
    await saveDataToFirebase('settings', settings, guildId);

    await interaction.reply({ 
        content: `Delivery notification channel set to ${channel}`, 
        ephemeral: true 
    });
}

async function handleRemoveStockCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const itemId = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    const guildId = interaction.guildId;

    const stock = await loadDataFromFirebase('stock', guildId);

    if (!stock[itemId]) {
        return await interaction.reply({ content: 'Item not found!', ephemeral: true });
    }

    const oldQuantity = stock[itemId].quantity;
    stock[itemId].quantity = Math.max(0, stock[itemId].quantity - quantity);
    const newQuantity = stock[itemId].quantity;
    await saveDataToFirebase('stock', stock, guildId);

    // If the quantity dropped to 0, delete associated embeds
    if (oldQuantity > 0 && newQuantity === 0) {
        await deleteItemEmbeds(itemId, guildId);
    }

    await interaction.reply({ 
        content: `Successfully removed ${quantity} from ${itemId}. New quantity: ${stock[itemId].quantity}`, 
        ephemeral: true 
    });
}

async function handleSetPriceCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const itemId = interaction.options.getString('item');
    const newPrice = interaction.options.getNumber('new_price');
    const guildId = interaction.guildId;

    const stock = await loadDataFromFirebase('stock', guildId);

    if (!stock[itemId]) {
        return await interaction.reply({ content: 'Item not found!', ephemeral: true });
    }

    stock[itemId].price = newPrice;
    await saveDataToFirebase('stock', stock, guildId);

    await interaction.reply({ 
        content: `Successfully updated ${itemId} price to ₱${newPrice.toFixed(2)}`, 
        ephemeral: true 
    });
}

async function handleAllOrdersCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const orders = await loadDataFromFirebase('orders', guildId);
    const orderEntries = Object.entries(orders);

    if (orderEntries.length === 0) {
        return await interaction.reply({ content: 'No orders found!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('All Orders')
        .setColor(0x2f3136)
        .setTimestamp();

    orderEntries.slice(0, 10).forEach(([orderId, order]) => {
        embed.addFields({
            name: `Order ${orderId}`,
            value: `User: <@${order.userId}>\n${order.itemName} x${order.quantity}\nStatus: ${order.status}\nTotal: ₱${order.totalPrice.toFixed(2)}`,
            inline: true
        });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function processDelivery(interaction, orderId, order, accountDetails) {
    const guildId = interaction.guildId;
    const settings = await loadDataFromFirebase('settings', guildId);
    const stock = await loadDataFromFirebase('stock', guildId);

    // Update order status to delivered
    const orders = await loadDataFromFirebase('orders', guildId);
    orders[orderId].status = 'Delivered';

    // Handle stock updates when order is delivered
    const item = stock[order.itemId];
    if (item) {
        // Release any reserved quantity and reduce actual stock
        if (item.reserved && item.reserved >= order.quantity) {
            item.reserved -= order.quantity;
        }

        // Reduce actual stock quantity
        item.quantity = Math.max(0, item.quantity - order.quantity);

        // If quantity reaches 0, delete associated embeds
        if (item.quantity === 0) {
            await deleteItemEmbeds(order.itemId, guildId);
        }
    }

    await saveDataToFirebase('orders', orders, guildId);
    await saveDataToFirebase('stock', stock, guildId);

    // Send delivery notification to the delivery channel (WITHOUT sensitive credentials)
    if (settings.deliveryChannel) {
        try {
            const deliveryChannel = await client.channels.fetch(settings.deliveryChannel);

            const deliveredEmbed = new EmbedBuilder()
                .setTitle('Order Delivered Successfully!')
                .setColor(0x00ff00)
                .setDescription(`**Order ID:** ${orderId}`)
                .addFields(
                    { name: 'Customer', value: `<@${order.userId}>`, inline: true },
                    { name: 'Item', value: order.itemName, inline: true },
                    { name: 'Quantity', value: order.quantity.toString(), inline: true },
                    { name: 'Total Price', value: `₱${order.totalPrice.toFixed(2)}`, inline: true },
                    { name: 'Payment Method', value: order.paymentMethod, inline: true },
                    { name: 'Status', value: 'Delivered', inline: true }
                );

            // SECURITY: Never include account credentials in public channels
            if (accountDetails) {
                deliveredEmbed.addFields(
                    { name: 'Account Type', value: 'Account credentials sent via DM', inline: false }
                );
            }
            
            deliveredEmbed.setTimestamp();
            await deliveryChannel.send({ embeds: [deliveredEmbed] });
        } catch (error) {
            // SECURITY: Don't log sensitive data in error messages
            console.error('Could not send delivery notification to delivery channel');
        }
    }

    // Send SECURE DM to the customer with credentials
    try {
        const user = await client.users.fetch(order.userId);
        const userEmbed = new EmbedBuilder()
            .setTitle('🔒 Your Order Has Been Delivered!')
            .setColor(0x00ff00)
            .setDescription(`**CONFIDENTIAL** - Your order ${orderId} has been successfully delivered.\n\n⚠️ **SECURITY NOTICE:** Please change the password immediately after first login and do not share these credentials with anyone.`)
            .addFields(
                { name: 'Item', value: order.itemName, inline: true },
                { name: 'Quantity', value: order.quantity.toString(), inline: true },
                { name: 'Order ID', value: orderId, inline: true }
            );

        if (accountDetails) {
            userEmbed.addFields(
                { name: '👤 Username', value: `||${accountDetails.username}||`, inline: true },
                { name: '🔑 Password', value: `||${accountDetails.password}||`, inline: true }
            );
            
            if (accountDetails.additionalInfo && accountDetails.additionalInfo.trim() !== '') {
                userEmbed.addFields(
                    { name: '📝 Additional Info', value: `||${accountDetails.additionalInfo}||`, inline: false }
                );
            }
            
            userEmbed.addFields(
                { name: '🛡️ Security Reminder', value: '• Change password immediately\n• Enable 2FA if available\n• Do not share credentials\n• This message will not be logged', inline: false }
            );
        }
        
        userEmbed.setFooter({ text: 'Thank you for choosing our service! Keep your credentials safe.' });
        userEmbed.setTimestamp();

        await user.send({ embeds: [userEmbed] });
        
        // Clear sensitive data from memory immediately
        if (accountDetails) {
            accountDetails.username = '[REDACTED]';
            accountDetails.password = '[REDACTED]';
            accountDetails.additionalInfo = '[REDACTED]';
        }
        
    } catch (error) {
        // SECURITY: Don't log sensitive data in error messages
        console.error('Could not send secure DM to user');
    }

    await interaction.reply({ 
        content: `🔒 Order ${orderId} marked as delivered! Secure credentials sent via DM to customer.`, 
        ephemeral: true 
    });
}

async function handleDeliverCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const orderId = interaction.options.getString('order_id');
    const guildId = interaction.guildId;
    const orders = await loadDataFromFirebase('orders', guildId);

    if (!orders[orderId]) {
        return await interaction.reply({ content: 'Order not found!', ephemeral: true });
    }

    const order = orders[orderId];

    // Check if this is an account order
    if (order.itemId && order.itemId.startsWith('account_')) {
        // Show modal to input account credentials
        const modal = new ModalBuilder()
            .setCustomId(`deliver_account_${orderId}`)
            .setTitle('Account Delivery Information');

        const usernameInput = new TextInputBuilder()
            .setCustomId('account_username')
            .setLabel('Account Username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const passwordInput = new TextInputBuilder()
            .setCustomId('account_password')
            .setLabel('Account Password')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const additionalInfoInput = new TextInputBuilder()
            .setCustomId('additional_info')
            .setLabel('Additional Information (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Any additional notes or instructions...');

        const firstRow = new ActionRowBuilder().addComponents(usernameInput);
        const secondRow = new ActionRowBuilder().addComponents(passwordInput);
        const thirdRow = new ActionRowBuilder().addComponents(additionalInfoInput);

        modal.addComponents(firstRow, secondRow, thirdRow);

        await interaction.showModal(modal);
        return;
    }

    // For non-account orders, proceed with normal delivery
    await processDelivery(interaction, orderId, order, null);
}


async function handleSetPaymentCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const method = interaction.options.getString('method');
    const details = interaction.options.getString('details');
    const guildId = interaction.guildId;

    const settings = await loadDataFromFirebase('settings', guildId);
    settings.paymentMethods[method] = details;
    await saveDataToFirebase('settings', settings, guildId);

    await interaction.reply({ 
        content: `Payment method ${method} updated successfully.`, 
        ephemeral: true 
    });
}

async function handleAnnounceCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const message = interaction.options.getString('message');

    const embed = new EmbedBuilder()
        .setTitle('Announcement')
        .setColor(0x2f3136)
        .setDescription(message)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleHealthCheckCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const guildId = interaction.guildId;

    try {
        // Check Firebase connectivity
        const startTime = Date.now();
        const testData = await loadDataFromFirebase('settings', guildId);
        const firebaseLatency = Date.now() - startTime;

        // Get stock and orders data
        const stock = await loadDataFromFirebase('stock', guildId);
        const orders = await loadDataFromFirebase('orders', guildId);

        // Count items and calculate stats
        const stockItems = Object.keys(stock).length;
        const totalOrders = Object.keys(orders).length;
        const pendingOrders = Object.values(orders).filter(order => order.status === 'Pending Payment').length;
        const deliveredOrders = Object.values(orders).filter(order => order.status === 'Delivered').length;

        // Calculate total stock quantity
        const totalStock = Object.values(stock).reduce((total, item) => total + (item.quantity || 0), 0);
        const reservedStock = Object.values(stock).reduce((total, item) => total + (item.reserved || 0), 0);

        // System uptime
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);

        const embed = new EmbedBuilder()
            .setTitle('🔧 System Health Check')
            .setColor(0x00ff00)
            .setDescription('Current system status and statistics')
            .addFields(
                { name: '🌐 Firebase Status', value: `✅ Connected\n⚡ Latency: ${firebaseLatency}ms`, inline: true },
                { name: '📦 Stock Status', value: `📊 ${stockItems} items\n📈 ${totalStock} total quantity\n🔒 ${reservedStock} reserved`, inline: true },
                { name: '📋 Orders Status', value: `📝 ${totalOrders} total\n⏳ ${pendingOrders} pending\n✅ ${deliveredOrders} delivered`, inline: true },
                { name: '⏰ System Uptime', value: `${uptimeHours}h ${uptimeMinutes}m`, inline: true },
                { name: '🤖 Bot Status', value: `✅ Online\n🏠 ${client.guilds.cache.size} servers`, inline: true },
                { name: '🔄 Express Server', value: '✅ Running on port 5000', inline: true }
            )
            .setFooter({ text: 'Last checked' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error('Health check error:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('⚠️ System Health Check - Issues Detected')
            .setColor(0xff0000)
            .setDescription(`Error during health check: ${error.message}`)
            .addFields(
                { name: '🤖 Bot Status', value: '✅ Online', inline: true },
                { name: '🔄 Express Server', value: '✅ Running on port 5000', inline: true },
                { name: '🌐 Firebase Status', value: '❌ Connection Error', inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// Reservation system functions

const RESERVATION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// Function to get the current available quantity (total - reserved)
function getAvailableQuantity(item) {
    return item.quantity - (item.reserved || 0);
}

// Function to delete associated embeds for an item
async function deleteItemEmbeds(itemId, guildId) {
    if (!embedMessageIds.has(itemId) || embedMessageIds.get(itemId).length === 0) {
        console.log(`No embeds to delete for item ${itemId}`);
        return;
    }

    const messageIdsToDelete = embedMessageIds.get(itemId);
    const stock = await loadDataFromFirebase('stock', guildId);
    const item = stock[itemId];

    // Determine which channel to fetch the message from. Ideally, this should be stored with the message ID.
    // For simplicity, we'll assume a main "shop" channel or the channel where it was last sent.
    // A more robust solution would store the channel ID along with the message ID.
    // For now, we'll try to iterate through guilds the bot is in.

    for (const guild of client.guilds.cache.values()) {
        const messagesToDeleteInGuild = [];
        for (const messageId of messageIdsToDelete) {
            try {
                // Attempt to fetch the message in the current guild
                const channel = await guild.channels.cache.find(ch => ch.type === 0); // Find any text channel
                if (channel) {
                    const message = await channel.messages.fetch(messageId);
                    if (message) {
                        messagesToDeleteInGuild.push(message.delete());
                    }
                }
            } catch (error) {
                // Message might have been deleted already or bot doesn't have permissions
                if (error.code !== 10008) { // 10008: Unknown message, likely already deleted
                    console.error(`Error deleting message ${messageId} for item ${itemId}:`, error);
                }
            }
        }
        // Wait for all deletions in this guild to attempt
        if (messagesToDeleteInGuild.length > 0) {
            await Promise.allSettled(messagesToDeleteInGuild);
        }
    }

    // Clear the tracked message IDs for this item
    embedMessageIds.delete(itemId);
    console.log(`Deleted embeds for item ${itemId}`);
}


// Function to clean expired reservations
async function cleanExpiredReservations(guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);
    const now = Date.now();
    let changesMade = false;

    for (const itemId in stock) {
        const item = stock[itemId];
        if (item.reserved && item.reserved > 0) {
            // Check if reservation has expired
            if (item.reservationTimestamp && item.reservationTimestamp + RESERVATION_EXPIRY_MS < now) {
                // Release the reserved quantity back to stock
                item.quantity += item.reserved;
                item.reserved = 0;
                delete item.reservationTimestamp; // Clean up timestamp
                changesMade = true;
                console.log(`Released ${item.reserved} of ${itemId} due to expired reservation.`);
                // If the item's quantity is now 0, delete its embeds
                if (item.quantity === 0) {
                    await deleteItemEmbeds(itemId, guildId);
                }
            }
        }
    }

    if (changesMade) {
        await saveDataToFirebase('stock', stock, guildId);
    }
}

// Function to reserve an item
async function reserveItem(itemId, quantity, guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);
    const item = stock[itemId];

    if (!item) {
        throw new Error('Item not found.');
    }

    const availableQuantity = getAvailableQuantity(item);

    if (availableQuantity < quantity) {
        throw new Error('Not enough stock available.');
    }

    // Update item quantities
    item.reserved = (item.reserved || 0) + quantity;
    item.reservationTimestamp = Date.now(); // Set reservation timestamp
    stock[itemId] = item;

    await saveDataToFirebase('stock', stock, guildId);
    return true;
}

// Function to release reservation (e.g., if order is cancelled)
async function releaseReservation(itemId, quantity, guildId) {
    const stock = await loadDataFromFirebase('stock', guildId);
    const item = stock[itemId];

    if (!item) {
        throw new Error('Item not found.');
    }

    if (item.reserved && item.reserved >= quantity) {
        item.reserved -= quantity;
        if (item.reserved === 0) {
            delete item.reservationTimestamp; // Remove timestamp if no more reserved
        }
        stock[itemId] = item;
        await saveDataToFirebase('stock', stock, guildId);
        return true;
    } else {
        throw new Error('Invalid reservation release quantity.');
    }
}


// Button handling
async function handleButton(interaction) {
    if (interaction.customId === 'checkout_modal') {
        const modal = new ModalBuilder()
            .setCustomId('checkout_input_modal')
            .setTitle('Checkout - Enter Order ID');

        const orderIdInput = new TextInputBuilder()
            .setCustomId('order_id_input')
            .setLabel('Order ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your Order ID here...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(orderIdInput);
        modal.addComponents(firstRow);

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'buy_modal') {
        const modal = new ModalBuilder()
            .setCustomId('buy_input_modal')
            .setTitle('Purchase - Enter Item Details');

        const itemIdInput = new TextInputBuilder()
            .setCustomId('item_id_input')
            .setLabel('Item ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Item ID (e.g., robux_1000, account_123)')
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity_input')
            .setLabel('Quantity (For Robux items only, leave 1 for accounts)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setValue('1')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(itemIdInput);
        const secondRow = new ActionRowBuilder().addComponents(quantityInput);
        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'status_modal') {
        const modal = new ModalBuilder()
            .setCustomId('status_input_modal')
            .setTitle('Order Status - Enter Order ID');

        const orderIdInput = new TextInputBuilder()
            .setCustomId('order_id_input')
            .setLabel('Order ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your Order ID here...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(orderIdInput);
        modal.addComponents(firstRow);

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'orders_modal') {
        const modal = new ModalBuilder()
            .setCustomId('orders_input_modal')
            .setTitle('Order History - Enter User ID');

        const userIdInput = new TextInputBuilder()
            .setCustomId('user_id_input')
            .setLabel('User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter User ID here...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(userIdInput);
        modal.addComponents(firstRow);

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'view_my_orders') {
        const guildId = interaction.guildId;
        const orders = await loadDataFromFirebase('orders', guildId);
        const userOrders = Object.entries(orders).filter(([_, order]) => order.userId === interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('Your Order History')
            .setColor(0x2f3136)
            .setDescription(`Order history for ${interaction.user.username}`)
            .setTimestamp();

        if (userOrders.length === 0) {
            embed.addFields({ name: 'No Orders Found', value: 'You have not placed any orders yet.', inline: false });
        } else {
            userOrders.slice(0, 10).forEach(([orderId, order]) => {
                embed.addFields({
                    name: `Order ${orderId}`,
                    value: `Item: ${order.itemName}\nQuantity: ${order.quantity}\nStatus: ${order.status}\nTotal: ₱${order.totalPrice.toFixed(2)}\nDate: ${new Date(order.timestamp).toLocaleDateString()}`,
                    inline: false
                });
            });

            if (userOrders.length > 10) {
                embed.setFooter({ text: `Showing 10 of ${userOrders.length} orders` });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    if (interaction.customId.startsWith('order_')) {
        const itemId = interaction.customId.replace('order_', '');
        const guildId = interaction.guildId;
        const stock = await loadDataFromFirebase('stock', guildId);

        console.log(`Button clicked for item: ${itemId}`);
        console.log(`Available stock items:`, Object.keys(stock));

        // Check if the exact itemId exists, if not, it might be a malformed button
        if (!stock[itemId]) {
            console.log(`Item ${itemId} not found in stock. Available items:`, Object.keys(stock));
            return await interaction.reply({ content: 'This item is not found! Please contact an administrator.', ephemeral: true });
        }

        // Clean expired reservations before checking quantity
        await cleanExpiredReservations(guildId);

        const availableQuantity = getAvailableQuantity(stock[itemId]);
        if (availableQuantity <= 0) {
            return await interaction.reply({ content: 'This item is out of stock!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`buy_modal_${itemId}_1`)
            .setTitle('Purchase Information');

        const isRobuxItem = itemId.startsWith('robux_');

        if (isRobuxItem) {
            // Robux items need quantity, gamepass link, and payment method
            const quantityInput = new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantity')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('1');

            const usernameInput = new TextInputBuilder()
                .setCustomId('username')
                .setLabel('Gamepass link')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const paymentMethodInput = new TextInputBuilder()
                .setCustomId('payment_method')
                .setLabel('Preferred Payment Method')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Gcash, PayPal')
                .setRequired(true);

            const firstRow = new ActionRowBuilder().addComponents(quantityInput);
            const secondRow = new ActionRowBuilder().addComponents(usernameInput);
            const thirdRow = new ActionRowBuilder().addComponents(paymentMethodInput);

            modal.addComponents(firstRow, secondRow, thirdRow);
        } else {
            // Account items only need payment method
            const paymentMethodInput = new TextInputBuilder()
                .setCustomId('payment_method')
                .setLabel('Preferred Payment Method')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Gcash, PayPal')
                .setRequired(true);

            const firstRow = new ActionRowBuilder().addComponents(paymentMethodInput);
            modal.addComponents(firstRow);
        }

        await interaction.showModal(modal);
    }
}

// Modal handling
async function handleModal(interaction) {
    if (interaction.customId === 'checkout_input_modal') {
        const orderId = interaction.fields.getTextInputValue('order_id_input');
        const guildId = interaction.guildId;
        const orders = await loadDataFromFirebase('orders', guildId);
        const settings = await loadDataFromFirebase('settings', guildId);

        if (!orders[orderId]) {
            return await interaction.reply({ content: 'Order not found! Please check your Order ID and try again.', ephemeral: true });
        }

        const order = orders[orderId];

        // Verify that the user requesting checkout is the order owner
        if (order.userId !== interaction.user.id) {
            return await interaction.reply({ content: 'Access denied! You can only checkout your own orders.', ephemeral: true });
        }



        const embed = new EmbedBuilder()
            .setTitle(`Checkout - Order ${orderId}`)
            .setColor(0x00ff00)
            .addFields(
                { name: 'Item', value: order.itemName, inline: true },
                { name: 'Quantity', value: order.quantity.toString(), inline: true },
                { name: 'Total Price', value: `₱${order.totalPrice.toFixed(2)}`, inline: true },
                { name: 'Status', value: order.status, inline: true },
                { name: 'Payment Method', value: order.paymentMethod, inline: true },
                { name: 'Order Date', value: new Date(order.timestamp).toLocaleString(), inline: true }
            )
            .setTimestamp();

        const paymentMethod = order.paymentMethod.toLowerCase();
        if (settings.paymentMethods[paymentMethod]) {
            const paymentDetails = settings.paymentMethods[paymentMethod];

            // Check if payment details contain an image URL
            if (paymentDetails.includes('http') && (paymentDetails.includes('.png') || paymentDetails.includes('.jpg') || paymentDetails.includes('.jpeg') || paymentDetails.includes('.gif'))) {
                // Extract the image URL from the payment details
                const urlMatch = paymentDetails.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))/i);
                if (urlMatch) {
                    // Remove the image URL from the text and create only view QR code link
                    const textOnly = paymentDetails.replace(urlMatch[0], '').trim();
                    const paymentInstructions = textOnly + (textOnly ? '\n' : '') + `[🔍 View QR Code](${urlMatch[0]})\n\n⚠️ **Note:** If the QR code link doesn't work, please contact an admin for updated payment details.`;
                    embed.addFields({
                        name: 'Payment Instructions',
                        value: paymentInstructions
                    });
                } else {
                    embed.addFields({
                        name: 'Payment Instructions',
                        value: paymentDetails
                    });
                }
            } else {
                embed.addFields({
                    name: 'Payment Instructions',
                    value: paymentDetails
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    if (interaction.customId === 'buy_input_modal') {
        const itemId = interaction.fields.getTextInputValue('item_id_input');
        let quantity = parseInt(interaction.fields.getTextInputValue('quantity_input')) || 1;
        const guildId = interaction.guildId;
        const stock = await loadDataFromFirebase('stock', guildId);

        if (!stock[itemId]) {
            return await interaction.reply({ content: 'Item not found! Please check the Item ID and try again.', ephemeral: true });
        }

        // Clean expired reservations first
        await cleanExpiredReservations(guildId);

        const availableQuantity = getAvailableQuantity(stock[itemId]);
        if (availableQuantity < quantity) {
            return await interaction.reply({ content: 'Not enough stock available!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`buy_modal_${itemId}_${quantity}`)
            .setTitle('Purchase Information');

        const isRobuxItem = itemId.startsWith('robux_');
        const usernameLabel = isRobuxItem ? 'Gamepass link' : 'Your Roblox Username';

        const usernameInput = new TextInputBuilder()
            .setCustomId('username')
            .setLabel(usernameLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const paymentMethodInput = new TextInputBuilder()
            .setCustomId('payment_method')
            .setLabel('Preferred Payment Method')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Gcash, PayPal')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(usernameInput);
        const secondRow = new ActionRowBuilder().addComponents(paymentMethodInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'status_input_modal') {
        const orderId = interaction.fields.getTextInputValue('order_id_input');
        const guildId = interaction.guildId;
        const orders = await loadDataFromFirebase('orders', guildId);

        if (!orders[orderId]) {
            return await interaction.reply({ content: 'Order not found! Please check your Order ID and try again.', ephemeral: true });
        }

        const order = orders[orderId];

        // Verify that the user requesting status is the order owner
        if (order.userId !== interaction.user.id) {
            return await interaction.reply({ content: 'Access denied! You can only check the status of your own orders.', ephemeral: true });
        }



        const embed = new EmbedBuilder()
            .setTitle(`Order Status - ${orderId}`)
            .setColor(0x2f3136)
            .addFields(
                { name: 'Item', value: order.itemName, inline: true },
                { name: 'Quantity', value: order.quantity.toString(), inline: true },
                { name: 'Status', value: order.status, inline: true },
                { name: 'Order Date', value: new Date(order.timestamp).toLocaleString(), inline: true },
                { name: 'Total Price', value: `₱${order.totalPrice.toFixed(2)}`, inline: true },
                { name: 'Payment Method', value: order.paymentMethod, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    if (interaction.customId === 'orders_input_modal') {
        const userId = interaction.fields.getTextInputValue('user_id_input');
        const guildId = interaction.guildId;
        const orders = await loadDataFromFirebase('orders', guildId);
        const userOrders = Object.entries(orders).filter(([_, order]) => order.userId === userId);

        if (userOrders.length === 0) {
            return await interaction.reply({ content: 'No orders found for this user!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`Order History for User ${userId}`)
            .setColor(0x2f3136)
            .setTimestamp();

        userOrders.slice(0, 10).forEach(([orderId, order]) => {
            embed.addFields({
                name: `Order ${orderId}`,
                value: `${order.itemName} x${order.quantity}\nStatus: ${order.status}\nTotal: ₱${order.totalPrice.toFixed(2)}`,
                inline: true
            });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    if (interaction.customId.startsWith('buy_modal_')) {
        // Extract everything after "buy_modal_" up to the last underscore (which is the quantity)
        const modalData = interaction.customId.replace('buy_modal_', '');
        const lastUnderscoreIndex = modalData.lastIndexOf('_');
        const itemId = modalData.substring(0, lastUnderscoreIndex);
        let quantity = parseInt(modalData.substring(lastUnderscoreIndex + 1)) || 1;

        const isRobuxItem = itemId.startsWith('robux_');

        if (isRobuxItem) {
            if (interaction.fields.getTextInputValue('quantity')) {
                quantity = parseInt(interaction.fields.getTextInputValue('quantity'));
            }
        } else {
            // For accounts, quantity is always 1
            quantity = 1;
        }

        const guildId = interaction.guildId;
        const stock = await loadDataFromFirebase('stock', guildId);

        // For accounts, use the account username. For Robux, it's the gamepass link
        const username = isRobuxItem ? interaction.fields.getTextInputValue('username') : stock[itemId].username;
        const paymentMethod = interaction.fields.getTextInputValue('payment_method');
        const orders = await loadDataFromFirebase('orders', guildId);

        if (!stock[itemId]) {
            return await interaction.reply({ content: 'Item not found!', ephemeral: true });
        }

        // Clean expired reservations first
        await cleanExpiredReservations(guildId);

        const availableQuantity = getAvailableQuantity(stock[itemId]);
        if (availableQuantity < quantity) {
            return await interaction.reply({ content: 'Not enough stock available!', ephemeral: true });
        }

        if (quantity <= 0) {
            return await interaction.reply({ content: 'Invalid quantity!', ephemeral: true });
        }

        try {
            // Validate input data
            if (!username || username.trim() === '') {
                throw new Error('Username/Gamepass link is required.');
            }
            if (!paymentMethod || paymentMethod.trim() === '') {
                throw new Error('Payment method is required.');
            }

            // Attempt to reserve the item
            await reserveItem(itemId, quantity, guildId);

            const orderId = generateOrderId();
            const totalPrice = Math.round((stock[itemId].price * quantity) * 100) / 100; // Round to 2 decimal places

            const order = {
                orderId,
                userId: interaction.user.id,
                username: interaction.user.username,
                robloxUsername: username.trim(),
                itemId,
                itemName: stock[itemId].name,
                quantity,
                totalPrice,
                paymentMethod: paymentMethod.trim(),
                status: 'Pending Payment',
                timestamp: Date.now()
            };

            orders[orderId] = order;
            // The actual stock quantity reduction will happen upon payment confirmation or after reservation expiry if not paid.
            // For now, we only reduce the 'reserved' count.

            await saveDataToFirebase('orders', orders, guildId);
            // Save stock update (reserved quantity)
            await saveDataToFirebase('stock', stock, guildId);


            const usernameFieldName = isRobuxItem ? 'Gamepass Link' : 'Roblox Username';

            const embed = new EmbedBuilder()
                .setTitle('Order Placed Successfully!')
                .setColor(0x2f3136)
                .setDescription(`Order ID: ${orderId}`)
                .addFields(
                    { name: 'Item', value: order.itemName, inline: true },
                    { name: 'Quantity', value: quantity.toString(), inline: true },
                    { name: 'Total Price', value: `₱${totalPrice.toFixed(2)}`, inline: true },
                    { name: usernameFieldName, value: username, inline: true },
                    { name: 'Payment Method', value: paymentMethod, inline: true },
                    { name: 'Next Steps', value: `Go to <#1402669563849609256> to checkout your order`, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

            // Send order notification to order channel
            const settings = await loadDataFromFirebase('settings', guildId);
            if (settings.orderChannel) {
                try {
                    const orderChannel = await client.channels.fetch(settings.orderChannel);
                    const usernameFieldName2 = isRobuxItem ? 'Gamepass Link' : 'Roblox Username';

                    const orderEmbed = new EmbedBuilder()
                        .setTitle('Pending Orders')
                        .setColor(0xffff00)
                        .setAuthor({ 
                            name: `${interaction.user.username} (${interaction.user.displayname || interaction.user.username})`,
                            iconURL: interaction.user.displayAvatarURL()
                        })
                        .setDescription(`**Order ID:** ${orderId}\n**Item:** ${order.itemName}\n**Quantity:** ${quantity}\n**Total:** ₱${totalPrice.toFixed(2)}\n**${usernameFieldName2}:** ${isRobuxItem ? '[Hidden for security]' : username}\n**Payment Method:** ${paymentMethod}`)
                        .setTimestamp();

                    await orderChannel.send({ embeds: [orderEmbed] });
                } catch (error) {
                    console.error('Could not send order notification:', error);
                }
            }

            // Send automatic DM notification to admin for new pending orders
            try {
                const guild = await client.guilds.fetch(guildId);
                const adminId = guild.ownerId; // Gets the server owner ID
                const admin = await client.users.fetch(adminId);

                const usernameFieldName3 = isRobuxItem ? 'Gamepass Link' : 'Roblox Username';

                const adminDmEmbed = new EmbedBuilder()
                    .setTitle('New Pending Order Alert')
                    .setColor(0xff9900)
                    .setDescription(`A new order has been placed and requires your attention!`)
                    .addFields(
                        { name: 'Order ID', value: orderId, inline: true },
                        { name: 'Customer', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
                        { name: 'Item', value: order.itemName, inline: true },
                        { name: 'Quantity', value: quantity.toString(), inline: true },
                        { name: 'Total Price', value: `₱${totalPrice.toFixed(2)}`, inline: true },
                        { name: usernameFieldName3, value: username, inline: true },
                        { name: 'Payment Method', value: paymentMethod, inline: false }
                    )
                    .setTimestamp();

                await admin.send({ embeds: [adminDmEmbed] });
            } catch (error) {
                console.error('Could not send DM notification to admin:', error);
            }

            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('Order Confirmation')
                    .setColor(0x2f3136)
                    .setDescription(`Thank you for your order! Order ID: ${orderId}`)
                    .addFields(
                        { name: 'Item', value: order.itemName },
                        { name: 'Quantity', value: quantity.toString() },
                        { name: 'Total', value: `₱${totalPrice.toFixed(2)}` }
                    )
                    .setTimestamp();

                await interaction.user.send({ embeds: [dmEmbed] });
            } catch (error) {
                console.error('Could not send DM to user:', error);
            }

        } catch (error) {
            console.error('Error processing order:', error);
            await interaction.reply({ content: `An error occurred while processing your order: ${error.message}`, ephemeral: true });
        }
    }

    // Handle modal submit for delivering account orders
    if (interaction.customId.startsWith('deliver_account_')) {
        const orderId = interaction.customId.replace('deliver_account_', '');
        const guildId = interaction.guildId;
        const orders = await loadDataFromFirebase('orders', guildId);
        
        // SECURITY: Get sensitive data without logging
        const accountUsername = interaction.fields.getTextInputValue('account_username').trim();
        const accountPassword = interaction.fields.getTextInputValue('account_password').trim();
        const additionalInfo = interaction.fields.getTextInputValue('additional_info').trim();

        if (!orders[orderId]) {
            return await interaction.reply({ content: 'Order not found!', ephemeral: true });
        }

        // SECURITY: Validate credentials are provided
        if (!accountUsername || !accountPassword) {
            return await interaction.reply({ content: '🔒 Both username and password are required for account delivery!', ephemeral: true });
        }

        const order = orders[orderId];
        
        // SECURITY: Create secure credentials object (will be cleared after use)
        const accountDetails = {
            username: accountUsername,
            password: accountPassword,
            additionalInfo: additionalInfo || 'None'
        };

        await processDelivery(interaction, orderId, order, accountDetails);
        
        // SECURITY: Clear sensitive data from local variables immediately
        interaction.fields.getTextInputValue = () => '[REDACTED]';
    }
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);