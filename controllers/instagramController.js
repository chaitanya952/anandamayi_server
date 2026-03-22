"use strict";

const { db } = require("../config/db");

async function loadInstagramConfig() {
  const rows = await db.all(
    `SELECT key, value
     FROM settings
     WHERE key = ANY($1)`,
    [[
      "instagramVerifyToken",
      "instagramPageAccessToken",
      "instagramGraphApiVersion",
      "instagramPaymentLink",
      "instagramRegistrationFormUrl",
      "instagramPrivacyPolicyUrl",
      "instagramFollowupNote",
    ]]
  ).catch(() => []);

  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    verifyToken: settings.instagramVerifyToken || process.env.INSTAGRAM_VERIFY_TOKEN || "",
    accessToken: settings.instagramPageAccessToken || process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || "",
    graphApiVersion: settings.instagramGraphApiVersion || process.env.INSTAGRAM_GRAPH_API_VERSION || "v22.0",
    paymentLink: settings.instagramPaymentLink || process.env.INSTAGRAM_PAYMENT_LINK || "https://example.com/payment-link",
    registrationFormUrl: settings.instagramRegistrationFormUrl || process.env.INSTAGRAM_REGISTRATION_FORM_URL || "https://example.com/registration-form",
    privacyPolicyUrl: settings.instagramPrivacyPolicyUrl || process.env.INSTAGRAM_PRIVACY_POLICY_URL || "https://example.com/privacy-policy",
    followupNote: settings.instagramFollowupNote || process.env.INSTAGRAM_FOLLOWUP_NOTE || "30th of this month",
  };
}

const DEFAULT_BATCHES = [
  { key: "online_weekday", label: "Online Weekday", fee: 2500, aliases: ["online weekday", "weekday", "ow"] },
  { key: "online_weekend", label: "Online Weekend", fee: 2500, aliases: ["online weekend", "weekend", "owe"] },
  { key: "traya_india", label: "Traya India", fee: 3200, aliases: ["traya india", "india"] },
  { key: "traya_abroad", label: "Traya Abroad", fee: 5000, aliases: ["traya abroad", "abroad 1", "ta"] },
  { key: "abroad_group", label: "Abroad Group", fee: 4000, aliases: ["abroad group", "abroad", "group abroad"] },
  { key: "offline_classes", label: "Offline Classes", fee: 1500, aliases: ["offline classes", "offline", "classes"] },
];

const GREETING_TRIGGERS = ["hi", "hello", "interested", "hey", "namaskaram"];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatTimeLabel(value) {
  if (!value) return "";
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(value);
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalized = hours % 12 || 12;
  return `${normalized}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatSlot(batch) {
  const days = String(batch.days || "To be shared by our team");
  const start = formatTimeLabel(batch.start_time);
  const end = formatTimeLabel(batch.end_time);
  const timings = start && end ? `${start} - ${end}` : start || end || "To be shared by our team";
  return { days, timings };
}

async function loadAvailableBatches() {
  try {
    const rows = await db.all(
      `SELECT batch_name, days, start_time, end_time, fee
       FROM batches
       ORDER BY id ASC`
    );

    if (!rows.length) {
      return DEFAULT_BATCHES.map((batch) => ({
        ...batch,
        days: "Please contact us for available days",
        start_time: "",
        end_time: "",
      }));
    }

    const mapped = DEFAULT_BATCHES.map((batch) => {
      const fromDb = rows.find((row) => normalizeText(row.batch_name) === normalizeText(batch.label))
        || rows.find((row) => normalizeText(row.batch_name).includes(normalizeText(batch.label)))
        || null;

      return {
        ...batch,
        days: fromDb?.days || "Please contact us for available days",
        start_time: fromDb?.start_time || "",
        end_time: fromDb?.end_time || "",
        fee: Number(fromDb?.fee || batch.fee),
      };
    });

    return mapped;
  } catch (error) {
    console.error("Instagram batch lookup failed:", error.message);
    return DEFAULT_BATCHES.map((batch) => ({
      ...batch,
      days: "Please contact us for available days",
      start_time: "",
      end_time: "",
    }));
  }
}

async function resolveBatchSelection(messageText) {
  const normalized = normalizeText(messageText);
  const batches = await loadAvailableBatches();
  return batches.find((batch) =>
    batch.aliases.some((alias) => normalized === alias || normalized.includes(alias))
      || normalized === normalizeText(batch.label)
      || normalizeText(batch.label).includes(normalized)
  ) || null;
}

function buildGreetingMessage(config) {
  return [
    "Namaskaram 🙏✨",
    "Thank you for reaching out to us 💛",
    "",
    "Please choose your preferred batch:",
    "",
    "• Online Weekday",
    "• Online Weekend",
    "• Traya India",
    "• Traya Abroad",
    "• Abroad Group",
    "• Offline Classes",
    "",
    "👉 Reply with your preferred option",
    "",
    `Privacy Policy: ${config.privacyPolicyUrl}`,
  ].join("\n");
}

function buildBatchSelectionMessage(batch) {
  const slot = formatSlot(batch);
  return [
    `thankyou for choosing ${batch.label} 🌼`,
    "",
    "Here are the available slots:",
    `📅 Days: ${slot.days}`,
    `⏰ Timings: ${slot.timings}`,
    "",
    "👉 Please select your preferred slot",
  ].join("\n");
}

async function buildFeeDetailsMessage() {
  const batches = await loadAvailableBatches();
  const lines = [
    "Fee details 💰✨",
    "",
    ...batches.map((batch) => `• ${batch.label} – ₹${Number(batch.fee || 0)}`),
    "",
    "📌 8 classes per month",
    "📌 1 hour session",
  ];
  return lines.join("\n");
}

function buildRegistrationMessage(config) {
  return [
    "To confirm your slot 🌸",
    "",
    `🔗 Payment Link: ${config.paymentLink}`,
    `📝 Registration Form: ${config.registrationFormUrl}`,
    `🔒 Privacy Policy: ${config.privacyPolicyUrl}`,
    "",
    "👉 Kindly complete both to secure your seat",
  ].join("\n");
}

function buildFinalMessage(config) {
  return [
    "Dhanyavaadalu 🙏💖",
    "Thank you for registering with us ✨",
    "",
    "Welcome to our family 🤍",
    "",
    `📌 Our team will get back to you on ${config.followupNote}`,
  ].join("\n");
}

async function sendInstagramMessage(recipientId, text, config) {
  if (!config.accessToken) {
    console.warn("Instagram reply skipped: INSTAGRAM_PAGE_ACCESS_TOKEN is not configured.");
    return;
  }

  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Instagram send failed (${response.status}): ${errorText}`);
  }
}

async function buildReplySequence(messageText, config) {
  const normalized = normalizeText(messageText);

  if (GREETING_TRIGGERS.some((trigger) => normalized === trigger || normalized.includes(trigger))) {
    return [buildGreetingMessage(config)];
  }

  const selectedBatch = await resolveBatchSelection(normalized);
  if (selectedBatch) {
    return [
      buildBatchSelectionMessage(selectedBatch),
      await buildFeeDetailsMessage(),
      buildRegistrationMessage(config),
    ];
  }

  if (/(fee|fees|price|cost)/i.test(normalized)) {
    return [await buildFeeDetailsMessage()];
  }

  if (/(register|registration|form|payment|pay|link)/i.test(normalized)) {
    return [buildRegistrationMessage(config)];
  }

  if (/(done|paid|registered|completed)/i.test(normalized)) {
    return [buildFinalMessage(config)];
  }

  return [buildGreetingMessage(config)];
}

async function verifyWebhook(req, res) {
  const config = await loadInstagramConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

async function receiveWebhook(req, res) {
  try {
    const config = await loadInstagramConfig();
    const body = req.body || {};
    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {
      const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];

      for (const event of messagingEvents) {
        if (!event?.sender?.id) continue;
        if (event?.message?.is_echo) continue;

        const senderId = event.sender.id;
        const text = String(event?.message?.text || "").trim();

        if (!text) continue;

        const replies = await buildReplySequence(text, config);
        for (const reply of replies) {
          await sendInstagramMessage(senderId, reply, config);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Instagram webhook error:", error.message);
    res.sendStatus(500);
  }
}

module.exports = {
  verifyWebhook,
  receiveWebhook,
};
