
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
        .setName('shop')
        .setDescription('View all available items in the shop'),
    
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Place an order for an item')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Item to purchase')
                .setRequired(true)
                .addChoices(
                    { name: '1000 Robux', value: 'robux_1000' },
                    { name: '5000 Robux', value: 'robux_5000' },
                    { name: 'Premium Account', value: 'account_premium' }
                ))
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
        .setName('help')
        .setDescription('Show available commands and support information'),

    // Admin commands
    new SlashCommandBuilder()
        .setName('addstock')
        .setDescription('Add or update stock')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('Item ID')
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
            case 'shop':
                await handleShopCommand(interaction);
                break;
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
            case 'help':
                await handleHelpCommand(interaction);
                break;
            case 'addstock':
                await handleAddStockCommand(interaction);
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

async function handleShopCommand(interaction) {
    const stock = loadData('stock.json');
    
    const embed = new EmbedBuilder()
        .setTitle('Shop - Available Items')
        .setColor(0x2f3136)
        .setDescription('Choose an item to purchase:')
        .setTimestamp();

    const buttons = new ActionRowBuilder();

    for (const [itemId, item] of Object.entries(stock)) {
        embed.addFields({
            name: item.name,
            value: `Price: ₱${item.price.toFixed(2)}\nStock: ${item.quantity}`,
            inline: true
        });

        if (buttons.components.length < 5) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_${itemId}`)
                    .setLabel(`Order ${item.name}`)
                    .setStyle(ButtonStyle.Primary)
            );
        }
    }

    await interaction.reply({ embeds: [embed], components: [buttons] });
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

    const usernameInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Your Roblox Username')
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

async function handleHelpCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Shop Bot Help')
        .setColor(0x2f3136)
        .setDescription('Available commands:')
        .addFields(
            { name: 'User Commands', value: '/shop - View available items\n/buy - Purchase an item\n/checkout - View payment info\n/orders - View your orders\n/status - Check order status', inline: false },
            { name: 'Support', value: 'Contact an administrator for help with your orders.', inline: false }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Admin commands
async function handleAddStockCommand(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        return await interaction.reply({ content: 'You need Administrator permissions to use this command!', ephemeral: true });
    }

    const itemId = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    const price = interaction.options.getNumber('price');
    
    const stock = loadData('stock.json');
    
    if (!stock[itemId]) {
        stock[itemId] = { name: itemId, quantity: 0, price: 0 };
    }
    
    stock[itemId].quantity += quantity;
    stock[itemId].price = price;
    
    saveData('stock.json', stock);

    await interaction.reply({ 
        content: `Successfully added ${quantity} of ${itemId} at ₱${price.toFixed(2)} each.`, 
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

        const usernameInput = new TextInputBuilder()
            .setCustomId('username')
            .setLabel('Your Roblox Username')
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

        const embed = new EmbedBuilder()
            .setTitle('Order Placed Successfully!')
            .setColor(0x2f3136)
            .setDescription(`Order ID: ${orderId}`)
            .addFields(
                { name: 'Item', value: order.itemName, inline: true },
                { name: 'Quantity', value: quantity.toString(), inline: true },
                { name: 'Total Price', value: `₱${totalPrice.toFixed(2)}`, inline: true },
                { name: 'Roblox Username', value: username, inline: true },
                { name: 'Payment Method', value: paymentMethod, inline: true },
                { name: 'Next Steps', value: `Use /checkout ${orderId} to view payment instructions.`, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

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
