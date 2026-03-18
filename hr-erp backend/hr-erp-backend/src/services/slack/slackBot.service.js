const { query } = require('../../database/connection');
const { logger } = require('../../utils/logger');
const wellmindService = require('../wellmind.service');
const gamificationService = require('../gamification.service');

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI → MOOD MAPPING (1-5 scale)
// ═══════════════════════════════════════════════════════════════════════════

const EMOJI_MOOD_MAP = {
  ':sob:': 1,
  ':cry:': 1,
  ':disappointed:': 1,
  ':worried:': 2,
  ':confused:': 2,
  ':pensive:': 2,
  ':neutral_face:': 3,
  ':expressionless:': 3,
  ':slightly_smiling_face:': 4,
  ':smile:': 4,
  ':blush:': 4,
  ':grinning:': 5,
  ':star-struck:': 5,
  ':heart_eyes:': 5,
  ':partying_face:': 5,
};

// Emojis sent as reaction hints on check-in messages
const REACTION_EMOJIS = ['sob', 'worried', 'neutral_face', 'slightly_smiling_face', 'grinning'];

class SlackBotService {
  constructor() {
    this.app = null;
    this.initialized = false;
  }

  /**
   * Initialize the Slack Bolt app. Call once from server startup.
   */
  async initialize() {
    if (!process.env.SLACK_BOT_TOKEN) {
      logger.warn('SLACK_BOT_TOKEN not set — Slack integration disabled');
      return;
    }

    try {
      // Dynamic import so missing @slack/bolt doesn't crash the app
      const { App } = require('@slack/bolt');

      this.app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET || '',
        socketMode: false,
      });

      this.setupEventHandlers();
      this.initialized = true;
      logger.info('Slack bot service initialized');
    } catch (err) {
      logger.warn('Slack bot initialization failed (is @slack/bolt installed?):', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  setupEventHandlers() {
    if (!this.app) return;

    // Handle reaction_added events (emoji responses to check-in messages)
    this.app.event('reaction_added', async ({ event }) => {
      try {
        await this.handleReaction(event);
      } catch (error) {
        logger.error('Slack reaction handler error:', error);
      }
    });

    // Handle app_mention
    this.app.event('app_mention', async ({ event }) => {
      try {
        await this.app.client.chat.postMessage({
          channel: event.channel,
          text: 'Szia! 👋 Napi check-in üzeneteket küldök minden reggel. Reagálj emoji-val a hangulatod jelzésére!',
        });
      } catch (error) {
        logger.error('Slack mention handler error:', error);
      }
    });
  }

  /**
   * Handle a reaction event — submit pulse survey if it's on our check-in message.
   */
  async handleReaction(event) {
    const { reaction, item, user: slackUserId } = event;

    // Find our check-in message
    const messageResult = await query(
      `SELECT * FROM slack_checkin_messages
       WHERE message_ts = $1 AND slack_user_id = $2 AND responded_at IS NULL`,
      [item.ts, slackUserId]
    );

    if (messageResult.rows.length === 0) return; // Not our message or already responded

    const msg = messageResult.rows[0];
    const emoji = `:${reaction}:`;
    const moodScore = EMOJI_MOOD_MAP[emoji] || 3; // Default to neutral

    // Submit pulse survey via wellmind service
    try {
      const pulse = await wellmindService.submitPulse(
        msg.user_id, msg.contractor_id,
        {
          mood_score: moodScore,
          stress_level: null,
          sleep_quality: null,
          workload_level: null,
          notes: `Slack check-in (${emoji})`,
        }
      );

      // Update the check-in message record
      await query(
        `UPDATE slack_checkin_messages
         SET responded_at = NOW(), response_emoji = $1, pulse_id = $2
         WHERE id = $3`,
        [emoji, pulse.id, msg.id]
      );

      // Award gamification points
      gamificationService.awardPoints(
        msg.user_id, msg.contractor_id, 'pulse_survey', pulse.id
      ).catch(err => logger.error('Gamification error (slack pulse):', err));

      gamificationService.updateStreak(msg.user_id, 'pulse_survey')
        .catch(err => logger.error('Gamification streak error (slack):', err));

      // Send thread confirmation
      await this.app.client.chat.postMessage({
        channel: msg.channel_id,
        text: `Köszönöm a választ! 🎯 +10 pont a napi pulzusért!`,
        thread_ts: msg.message_ts,
      });

      logger.info(`Slack check-in response: user=${msg.user_id}, mood=${moodScore}, emoji=${emoji}`);
    } catch (error) {
      logger.error('Error submitting pulse from Slack:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY CHECK-IN
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Send daily check-in DMs to all enabled Slack users for a contractor.
   */
  async sendDailyCheckIn(contractorId) {
    if (!this.app) {
      logger.warn('Slack bot not initialized — skipping check-in');
      return { sent: 0, errors: [] };
    }

    // Get config
    const configResult = await query(
      `SELECT * FROM slack_checkin_config
       WHERE contractor_id = $1 AND enabled = true`,
      [contractorId]
    );

    if (configResult.rows.length === 0) {
      return { sent: 0, errors: ['No active config for contractor'] };
    }

    const { message_template } = configResult.rows[0];

    // Get all enabled Slack users
    const usersResult = await query(
      `SELECT su.*, u.name
       FROM slack_users su
       JOIN users u ON u.id = su.user_id
       WHERE su.contractor_id = $1 AND su.enabled = true AND u.is_active = true`,
      [contractorId]
    );

    let sent = 0;
    const errors = [];

    for (const slackUser of usersResult.rows) {
      try {
        // Open DM channel
        const dm = await this.app.client.conversations.open({
          users: slackUser.slack_user_id,
        });

        // Send check-in message with emoji hints
        const result = await this.app.client.chat.postMessage({
          channel: dm.channel.id,
          text: message_template,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message_template,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'Reagálj emoji-val: 😢 😟 😐 🙂 😄',
                },
              ],
            },
          ],
        });

        // Add default reaction options to the message
        for (const emoji of REACTION_EMOJIS) {
          try {
            await this.app.client.reactions.add({
              channel: dm.channel.id,
              timestamp: result.ts,
              name: emoji,
            });
          } catch {
            // Ignore individual reaction errors
          }
        }

        // Record sent message
        await query(
          `INSERT INTO slack_checkin_messages
             (slack_user_id, user_id, contractor_id, message_ts, channel_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [slackUser.slack_user_id, slackUser.user_id, contractorId, result.ts, dm.channel.id]
        );

        sent++;
      } catch (error) {
        logger.error(`Slack send error for ${slackUser.slack_user_id}:`, error.message);
        errors.push({ userId: slackUser.user_id, error: error.message });
      }
    }

    logger.info(`Slack daily check-in: sent=${sent}, errors=${errors.length} for contractor=${contractorId}`);
    return { sent, errors };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USER SYNC
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sync Slack workspace users with our user database (match by email).
   */
  async syncUsers(contractorId) {
    if (!this.app) throw new Error('Slack bot not initialized');

    const result = await this.app.client.users.list();
    const slackMembers = result.members.filter(u => !u.is_bot && !u.deleted && u.profile?.email);

    let synced = 0;

    for (const member of slackMembers) {
      const email = member.profile.email;

      // Find matching user in our system
      const userResult = await query(
        `SELECT id FROM users WHERE email = $1 AND contractor_id = $2 AND is_active = true`,
        [email, contractorId]
      );

      if (userResult.rows.length === 0) continue;

      // Upsert slack_users
      await query(
        `INSERT INTO slack_users
           (user_id, contractor_id, slack_user_id, slack_email, slack_real_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slack_user_id)
         DO UPDATE SET
           user_id = EXCLUDED.user_id,
           slack_email = EXCLUDED.slack_email,
           slack_real_name = EXCLUDED.slack_real_name,
           updated_at = NOW()`,
        [userResult.rows[0].id, contractorId, member.id, email, member.real_name]
      );

      synced++;
    }

    logger.info(`Slack user sync: synced=${synced}/${slackMembers.length} for contractor=${contractorId}`);
    return { synced, total: slackMembers.length };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST MESSAGE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Send a test check-in message to a specific Slack user.
   */
  async sendTestMessage(slackUserId, messageTemplate) {
    if (!this.app) throw new Error('Slack bot not initialized');

    const template = messageTemplate || 'Szia! 👋 Ez egy teszt check-in üzenet.';

    const dm = await this.app.client.conversations.open({ users: slackUserId });

    const result = await this.app.client.chat.postMessage({
      channel: dm.channel.id,
      text: template,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `${template}\n\n_⚠️ Ez egy teszt üzenet._` },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'Reagálj emoji-val: 😢 😟 😐 🙂 😄' }],
        },
      ],
    });

    return { messageTs: result.ts, channelId: dm.channel.id };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BOLT APP START
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Start the Slack Bolt HTTP receiver (for event subscriptions).
   */
  async start(port = 3001) {
    if (!this.app) {
      logger.warn('Slack bot disabled — SLACK_BOT_TOKEN not set');
      return;
    }

    await this.app.start(port);
    logger.info(`⚡️ Slack bot listening on port ${port}`);
  }
}

// Export constants for testing
SlackBotService.EMOJI_MOOD_MAP = EMOJI_MOOD_MAP;
SlackBotService.REACTION_EMOJIS = REACTION_EMOJIS;

module.exports = new SlackBotService();
module.exports.SlackBotService = SlackBotService;
