const { App } = require('@slack/bolt');
const { Client } = require('@notionhq/client');

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN
});

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Helper function to extract query from Slack message
function extractQuery(text) {
  // Remove bot mention and clean up the query
  return text.replace(/<@[^>]+>/g, '').trim();
}

// Helper function to truncate text
function truncateText(text, maxLength = 200) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Helper function to format Notion results for Slack
function formatResults(results, query) {
  if (!results || results.length === 0) {
    return `🤷‍♂️ I couldn't find anything for "${query}" in your Notion setup.\n\nMake sure you've shared the relevant pages/databases with the "Family Task Slackbot" integration.`;
  }

  let response = `🔍 Found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}":\n\n`;

  results.slice(0, 5).forEach((result, index) => {
    const { object, properties, title, url } = result;
    let itemTitle = 'Untitled';
    let snippet = '';

    if (object === 'page') {
      // Handle page results
      if (title && title.length > 0) {
        itemTitle = title[0].plain_text || 'Untitled Page';
      }
      if (properties && properties.title) {
        itemTitle = properties.title.title?.[0]?.plain_text || itemTitle;
      }
    } else if (object === 'database') {
      // Handle database results  
      if (title && title.length > 0) {
        itemTitle = title[0].plain_text || 'Untitled Database';
      }
    }

    // Create formatted result
    response += `*${index + 1}. ${itemTitle}*\n`;
    response += `<${url}|View in Notion>\n\n`;
  });

  if (results.length > 5) {
    response += `_... and ${results.length - 5} more results_\n`;
  }

  return response;
}

// Main search function
async function searchNotion(query) {
  try {
    console.log(`Searching Notion for: "${query}"`);
    
    const response = await notion.search({
      query: query,
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    });

    console.log(`Found ${response.results.length} results`);
    return response.results;

  } catch (error) {
    console.error('Error searching Notion:', error);
    throw new Error('Failed to search Notion. Please try again.');
  }
}

// Handle app mentions
app.event('app_mention', async ({ event, say }) => {
  try {
    const query = extractQuery(event.text);
    
    if (!query) {
      await say("👋 Hi! Ask me to search your Notion setup. For example: `@Family Task Slackbot find my grocery list`");
      return;
    }

    // Show typing indicator
    await say(`🔍 Searching your Notion for "${query}"...`);

    // Search Notion
    const results = await searchNotion(query);
    
    // Format and send results
    const formattedResults = formatResults(results, query);
    await say(formattedResults);

  } catch (error) {
    console.error('Error handling app mention:', error);
    await say(`❌ Sorry, I ran into an error: ${error.message}`);
  }
});

// Handle direct messages
app.message(async ({ message, say }) => {
  // Only respond to direct messages (not channel messages)
  if (message.channel_type !== 'im') return;

  try {
    const query = message.text.trim();
    
    if (!query) {
      await say("👋 Hi! Ask me to search your Notion setup. For example: `find my grocery list`");
      return;
    }

    // Show typing indicator  
    await say(`🔍 Searching your Notion for "${query}"...`);

    // Search Notion
    const results = await searchNotion(query);
    
    // Format and send results
    const formattedResults = formatResults(results, query);
    await say(formattedResults);

  } catch (error) {
    console.error('Error handling message:', error);
    await say(`❌ Sorry, I ran into an error: ${error.message}`);
  }
});

// Health check endpoint (removed - Slack Bolt handles this internally)

// Start the app
(async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log(`⚡️ Notion Slack Bot is running on port ${port}!`);
    console.log(`Bot is ready to receive messages!`);
  } catch (error) {
    console.error('Error starting app:', error);
    process.exit(1);
  }
})();
