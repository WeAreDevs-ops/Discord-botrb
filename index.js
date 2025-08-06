
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

// Data management functions
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

// Initialize data files
function initializeData() {
    const stockFile = loadData('stock.json');
    if (Object.keys(stockFile).length === 0) {
        saveData('stock.json', {});
    }

    const ordersFile = loadData('orders.json');
    if (Object.keys(ordersFile).length === 0) {
        saveData('orders.json', {});
    }

    const settingsFile = loadData('settings.json');
    if (Object.keys(settingsFile).length === 0) {
        saveData('settings.json', {
            paymentMethods: {
                paypal: 'Send payment to: example@paypal.com',
                cashapp: 'Send payment to: $ExampleTag',
                crypto: 'Bitcoin address: 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
            },
            announcementChannel: null
        });
    }
}

// Slash commands definition
const commands = [
    // User commands
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Place an order for an item')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Item ID to purchase')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Quantity to purchase')
                .setRequired(true)
                .setMinValue(1)),

    new SlashCommandBuilder()
        .setName('checkout')
        .setDescription('View payment instructions for an order')
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID to checkout')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('orders')
        .setDescription('View your order history'),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check the status of an order')
        .addStringOption(option =>
            option.setName('order_id')
                .setDescription('Order ID to check')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List available items')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of items to list')
                .setRequired(false)
                .addChoices(
                    { name: 'Robux', value: 'robux' },
                    { name: 'Accounts', value: 'accounts' },
                    { name: 'All', value: 'all' }
                )),

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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('addaccount')
        .setDescription('Add account to stock')
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Account description')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('premium')
                .setDescription('Is this a premium account?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('summary')
                .setDescription('Account summary/details')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('Price for this account')
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
                    { name: 'PayPal', value: 'paypal' },
                    { name: 'CashApp', value: 'cashapp' },
                    { name: 'Crypto', value: 'crypto' }
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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    initializeData();
    await registerCommands();
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
            case 'buy':
                await handleBuyCommand(interaction);
                break;
            case 'checkout':
                await handleCheckoutCommand(interaction);
                break;
            case 'orders':
                await handleOrdersCommand(interaction);
                break;
            case 'status':
                await handleStatusCommand(interaction);
                break;
            case 'list':
                await handleListCommand(interaction);
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

async function sendShopEmbed(channel) {
    const stock = loadData('stock.json');
    
    const availableItems = Object.entries(stock).filter(([_, item]) => item.quantity > 0);

    if (availableItems.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('Available Items')
            .setColor(0x2f3136)
            .setDescription('No items available at the moment. Please check back later!')
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('Available Items')
        .setColor(0x2f3136)
        .setDescription('Choose an item to purchase:')
        .setTimestamp();

    // Create action rows (each can hold up to 5 buttons, Discord allows up to 5 action rows)
    const actionRows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    for (const [itemId, item] of availableItems) {
        // Format item display based on type
        let fieldValue;
        if (item.premium !== undefined) {
            // Account item
            fieldValue = `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}\nPremium Status: ${item.premium}\n${item.description}`;
        } else {
            // Robux item
            fieldValue = `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}`;
        }

        embed.addFields({
            name: item.name,
            value: fieldValue,
            inline: false
        });

        // Add button if we haven't reached the maximum (25 buttons total: 5 rows × 5 buttons)
        if (buttonCount < 25) {
            // If current row is full (5 buttons), start a new row
            if (currentRow.components.length === 5) {
                actionRows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            // Determine button label based on item type
            let buttonLabel;
            if (itemId.startsWith('account_')) {
                buttonLabel = 'Order Account';
            } else {
                buttonLabel = `Order ${item.name}`;
            }

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_${itemId}`)
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
            );
            buttonCount++;
        }
    }

    // Add the last row if it has components
    if (currentRow.components.length > 0) {
        actionRows.push(currentRow);
    }

    await channel.send({ embeds: [embed], components: actionRows });
}

async function handleBuyCommand(interaction) {
    const itemId = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    const stock = loadData('stock.json');

    if (!stock[itemId]) {
        return await interaction.reply({ content: 'Item not found!', ephemeral: true });
    }

    if (stock[itemId].quantity < quantity) {
        return await interaction.reply({ content: 'Not enough stock available!', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId(`buy_modal_${itemId}_${quantity}`)
        .setTitle('Purchase Information');

    // Check if it's a Robux item to change the label
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
        .setPlaceholder('PayPal, CashApp, Crypto, etc.')
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(usernameInput);
    const secondRow = new ActionRowBuilder().addComponents(paymentMethodInput);

    modal.addComponents(firstRow, secondRow);

    await interaction.showModal(modal);
}

async function handleCheckoutCommand(interaction) {
    const orderId = interaction.options.getString('order_id');
    const orders = loadData('orders.json');
    const settings = loadData('settings.json');

    if (!orders[orderId]) {
        return await interaction.reply({ content: 'Order not found!', ephemeral: true });
    }

    const order = orders[orderId];
    
    if (order.userId !== interaction.user.id) {
        return await interaction.reply({ content: 'You can only view your own orders!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`Checkout - Order ${orderId}`)
        .setColor(0x2f3136)
        .addFields(
            { name: 'Item', value: order.itemName, inline: true },
            { name: 'Quantity', value: order.quantity.toString(), inline: true },
            { name: 'Total Price', value: `₱${order.totalPrice.toFixed(2)}`, inline: true },
            { name: 'Status', value: order.status, inline: true },
            { name: 'Payment Method', value: order.paymentMethod, inline: true }
        )
        .setTimestamp();

    const paymentMethod = order.paymentMethod.toLowerCase();
    if (settings.paymentMethods[paymentMethod]) {
        embed.addFields({
            name: 'Payment Instructions',
            value: settings.paymentMethods[paymentMethod]
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleOrdersCommand(interaction) {
    const orders = loadData('orders.json');
    const userOrders = Object.entries(orders).filter(([_, order]) => order.userId === interaction.user.id);

    if (userOrders.length === 0) {
        return await interaction.reply({ content: 'You have no orders!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('Your Orders')
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
}

async function handleStatusCommand(interaction) {
    const orderId = interaction.options.getString('order_id');
    const orders = loadData('orders.json');

    if (!orders[orderId]) {
        return await interaction.reply({ content: 'Order not found!', ephemeral: true });
    }

    const order = orders[orderId];
    
    if (order.userId !== interaction.user.id) {
        return await interaction.reply({ content: 'You can only view your own orders!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`Order Status - ${orderId}`)
        .setColor(0x2f3136)
        .addFields(
            { name: 'Item', value: order.itemName, inline: true },
            { name: 'Quantity', value: order.quantity.toString(), inline: true },
            { name: 'Status', value: order.status, inline: true },
            { name: 'Order Date', value: new Date(order.timestamp).toLocaleString(), inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleListCommand(interaction) {
    const type = interaction.options.getString('type') || 'all';
    const stock = loadData('stock.json');
    
    let availableItems = Object.entries(stock).filter(([_, item]) => item.quantity > 0);
    
    // Filter items based on type
    if (type === 'robux') {
        availableItems = availableItems.filter(([itemId]) => itemId.startsWith('robux_'));
    } else if (type === 'accounts') {
        availableItems = availableItems.filter(([itemId]) => itemId.startsWith('account_'));
    }

    if (availableItems.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('Available Items')
            .setColor(0x2f3136)
            .setDescription(`No ${type === 'all' ? '' : type} items available at the moment. Please check back later!`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('Available Items')
        .setColor(0x2f3136)
        .setDescription('Choose an item to purchase:')
        .setTimestamp();

    // Create action rows (each can hold up to 5 buttons, Discord allows up to 5 action rows)
    const actionRows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    for (const [itemId, item] of availableItems) {
        // Format item display based on type
        let fieldValue;
        if (item.premium !== undefined) {
            // Account item
            fieldValue = `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}\nPremium Status: ${item.premium}\n${item.description}`;
        } else {
            // Robux item
            fieldValue = `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}`;
        }

        embed.addFields({
            name: item.name,
            value: fieldValue,
            inline: false
        });

        // Add button if we haven't reached the maximum (25 buttons total: 5 rows × 5 buttons)
        if (buttonCount < 25) {
            // If current row is full (5 buttons), start a new row
            if (currentRow.components.length === 5) {
                actionRows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            // Determine button label based on item type
            let buttonLabel;
            if (itemId.startsWith('account_')) {
                buttonLabel = 'Order Account';
            } else {
                buttonLabel = `Order ${item.name}`;
            }

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_${itemId}`)
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
            );
            buttonCount++;
        }
    }

    // Add the last row if it has components
    if (currentRow.components.length > 0) {
        actionRows.push(currentRow);
    }

    await interaction.reply({ embeds: [embed], components: actionRows });
}

async function handleHelpCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Shop Bot Help')
        .setColor(0x2f3136)
        .setDescription('Available commands:')
        .addFields(
            { name: 'User Commands', value: '/list - View available items\n/buy - Purchase an item\n/checkout - View payment info\n/orders - View your orders\n/status - Check order status', inline: false },
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
    
    const stock = loadData('stock.json');
    const itemId = `robux_${amount}`;
    
    if (!stock[itemId]) {
        stock[itemId] = { name: `${amount} Robux`, quantity: 0, price: 0 };
    }
    
    stock[itemId].quantity += quantity;
    stock[itemId].price = price;
    
    saveData('stock.json', stock);

    await interaction.reply({ 
        content: `Successfully added ${quantity} of ${amount} Robux at ₱${price.toFixed(2)} each.`, 
        ephemeral: true 
    });
}

async function handleAddAccountCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const description = interaction.options.getString('description');
    const premium = interaction.options.getBoolean('premium');
    const summary = interaction.options.getString('summary');
    const price = interaction.options.getNumber('price');
    
    const stock = loadData('stock.json');
    const timestamp = Date.now();
    const itemId = `account_${timestamp}`;
    const premiumText = premium ? 'Premium' : 'Regular';
    
    stock[itemId] = { 
        name: `${premiumText} Account - ${description}`,
        description: description,
        premium: premium,
        summary: summary,
        quantity: 1,
        price: price
    };
    
    saveData('stock.json', stock);

    await interaction.reply({ 
        content: `Successfully added ${premiumText} Account "${description}" at ₱${price.toFixed(2)}.`, 
        ephemeral: true 
    });
}

async function handleOrderChannelCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    
    const settings = loadData('settings.json');
    settings.orderChannel = channel.id;
    saveData('settings.json', settings);

    await interaction.reply({ 
        content: `Order notification channel set to ${channel}`, 
        ephemeral: true 
    });
}

async function handleRemoveStockCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const itemId = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    
    const stock = loadData('stock.json');
    
    if (!stock[itemId]) {
        return await interaction.reply({ content: 'Item not found!', ephemeral: true });
    }
    
    stock[itemId].quantity = Math.max(0, stock[itemId].quantity - quantity);
    saveData('stock.json', stock);

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
    
    const stock = loadData('stock.json');
    
    if (!stock[itemId]) {
        return await interaction.reply({ content: 'Item not found!', ephemeral: true });
    }
    
    stock[itemId].price = newPrice;
    saveData('stock.json', stock);

    await interaction.reply({ 
        content: `Successfully updated ${itemId} price to ₱${newPrice.toFixed(2)}`, 
        ephemeral: true 
    });
}

async function handleAllOrdersCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const orders = loadData('orders.json');
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

async function handleDeliverCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const orderId = interaction.options.getString('order_id');
    const orders = loadData('orders.json');

    if (!orders[orderId]) {
        return await interaction.reply({ content: 'Order not found!', ephemeral: true });
    }

    orders[orderId].status = 'Delivered';
    saveData('orders.json', orders);

    try {
        const user = await client.users.fetch(orders[orderId].userId);
        const deliveryEmbed = new EmbedBuilder()
            .setTitle('Order Delivered!')
            .setColor(0x2f3136)
            .setDescription(`Your order ${orderId} has been delivered!`)
            .addFields(
                { name: 'Item', value: orders[orderId].itemName },
                { name: 'Quantity', value: orders[orderId].quantity.toString() }
            )
            .setTimestamp();

        await user.send({ embeds: [deliveryEmbed] });
    } catch (error) {
        console.error('Could not send DM to user:', error);
    }

    await interaction.reply({ 
        content: `Order ${orderId} marked as delivered and user notified.`, 
        ephemeral: true 
    });
}

async function handleSetPaymentCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const method = interaction.options.getString('method');
    const details = interaction.options.getString('details');
    
    const settings = loadData('settings.json');
    settings.paymentMethods[method] = details;
    saveData('settings.json', settings);

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

// Button handling
async function handleButton(interaction) {
    if (interaction.customId.startsWith('order_')) {
        const itemId = interaction.customId.replace('order_', '');
        const stock = loadData('stock.json');

        if (!stock[itemId] || stock[itemId].quantity === 0) {
            return await interaction.reply({ content: 'This item is out of stock!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`buy_modal_${itemId}_1`)
            .setTitle('Purchase Information');

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantity')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('1');

        // Check if it's a Robux item to change the label
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
            .setPlaceholder('PayPal, CashApp, Crypto, etc.')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(quantityInput);
        const secondRow = new ActionRowBuilder().addComponents(usernameInput);
        const thirdRow = new ActionRowBuilder().addComponents(paymentMethodInput);

        modal.addComponents(firstRow, secondRow, thirdRow);

        await interaction.showModal(modal);
    }
}

// Modal handling
async function handleModal(interaction) {
    if (interaction.customId.startsWith('buy_modal_')) {
        const parts = interaction.customId.split('_');
        const itemId = parts[2];
        let quantity = parseInt(parts[3]);

        // If quantity is from button interaction modal, get it from the form
        if (interaction.fields.getTextInputValue('quantity')) {
            quantity = parseInt(interaction.fields.getTextInputValue('quantity'));
        }

        const username = interaction.fields.getTextInputValue('username');
        const paymentMethod = interaction.fields.getTextInputValue('payment_method');

        const stock = loadData('stock.json');
        const orders = loadData('orders.json');

        if (!stock[itemId]) {
            return await interaction.reply({ content: 'Item not found!', ephemeral: true });
        }

        if (stock[itemId].quantity < quantity) {
            return await interaction.reply({ content: 'Not enough stock available!', ephemeral: true });
        }

        if (quantity <= 0) {
            return await interaction.reply({ content: 'Invalid quantity!', ephemeral: true });
        }

        const orderId = generateOrderId();
        const totalPrice = stock[itemId].price * quantity;

        const order = {
            orderId,
            userId: interaction.user.id,
            username: interaction.user.username,
            robloxUsername: username,
            itemId,
            itemName: stock[itemId].name,
            quantity,
            totalPrice,
            paymentMethod,
            status: 'Pending Payment',
            timestamp: Date.now()
        };

        orders[orderId] = order;
        stock[itemId].quantity -= quantity;

        saveData('orders.json', orders);
        saveData('stock.json', stock);

        // Check if it's a Robux item to change the label
        const isRobuxItem = itemId.startsWith('robux_');
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
                { name: 'Next Steps', value: `Use /checkout ${orderId} to view payment instructions.`, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Send order notification to order channel
        const settings = loadData('settings.json');
        if (settings.orderChannel) {
            try {
                const orderChannel = await client.channels.fetch(settings.orderChannel);
                // Check if it's a Robux item to change the label
                const isRobuxItem = itemId.startsWith('robux_');
                const usernameFieldName = isRobuxItem ? 'Gamepass Link' : 'Roblox Username';

                const orderEmbed = new EmbedBuilder()
                    .setTitle('Pending Orders')
                    .setColor(0xffff00)
                    .setAuthor({ 
                        name: `${interaction.user.username} (${interaction.user.displayName || interaction.user.username})`,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .setDescription(`**Order ID:** ${orderId}\n**Item:** ${order.itemName}\n**Quantity:** ${quantity}\n**Total:** ₱${totalPrice.toFixed(2)}\n**${usernameFieldName}:** ${username}\n**Payment Method:** ${paymentMethod}`)
                    .setTimestamp();

                await orderChannel.send({ embeds: [orderEmbed] });
            } catch (error) {
                console.error('Could not send order notification:', error);
            }
        }

        // Try to send DM
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
    }
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
