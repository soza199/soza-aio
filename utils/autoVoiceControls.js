const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');
const path = require('node:path');
const { TemporaryChannelModel } = require('../models/autoVoice/schema');

const Flags = PermissionsBitField.Flags;
const BUTTON_PREFIX = 'tempvoice_btn_';
const SELECT_PREFIX = 'tempvoice_select_';
const MODAL_PREFIX = 'tempvoice_modal_';
const BUTTON_GUIDE_NAME = 'tempvoice-button-guide.png';
const BUTTON_GUIDE_PATH = path.join(__dirname, '..', 'attached_assets', 'canvas_1791526122911.png');

const buttonRows = [
  [
    'name',
    'limit',
    'privacy',
    'waiting_room',
    'chat'
  ],
  [
    'trust',
    'untrust',
    'invite',
    'kick',
    'region'
  ],
  [
    'block',
    'unblock',
    'claim',
    'transfer',
    'delete'
  ]
];

const applicationEmojiNames = {
  name: '<:1000004015:1557992925319663736>',
  limit: '<:1000004016:1557992928016605224>',
  privacy: '<:1000004033:1557997850313359361>',
  waiting_room: '<:1000004018:1557992933016207370>',
  chat: '<:1000004019:1557992935285325874>',
  trust: '<:1000004020:1557992937004994602>',
  untrust: '<:1000004021:1557992939571904512>',
  invite: '<:1000004022:1557992942789070940>',
  kick: '<:1000004023:1557992946538774668>',
  region: '<:1000004024:1557992949474791544>',
  block: '<:1000004025:1557992951647445062>',
  unblock: '<:1000004026:1557992954034131025>',
  claim: '<:1000004027:1557992956403781732>',
  transfer: '<:1000004028:1557992958639476756>',
  delete: '<:1000004014:1557992960581439518>'
};

const fallbackEmojis = {
  name: '<:1000004015:1557992925319663736>',
  limit: '<:1000004016:1557992928016605224>',
  privacy: '<:1000004033:1557997850313359361>',
  waiting_room: '<:1000004018:1557992933016207370>',
  chat: '<:1000004019:1557992935285325874>',
  trust: '<:1000004020:1557992937004994602>',
  untrust: '<:1000004021:1557992939571904512>',
  invite: '<:1000004022:1557992942789070940>',
  kick: '<:1000004023:1557992946538774668>',
  region: '<:1000004024:1557992949474791544>',
  block: '<:1000004025:1557992951647445062>',
  unblock: '<:1000004026:1557992954034131025>',
  claim: '<:1000004027:1557992956403781732>',
  transfer: '<:1000004028:1557992958639476756>',
  delete: '<:1000004014:1557992960581439518>'
};

const applicationEmojiCache = new WeakMap();
const warnedMissingEmojiNames = new Set();

async function fetchApplicationEmojis(client) {
  if (!client?.application?.emojis?.fetch) {
    console.warn('[TempVoice] Application emojis are unavailable; using Unicode button emojis.');
    return null;
  }

  if (!applicationEmojiCache.has(client)) {
    applicationEmojiCache.set(
      client,
      client.application.emojis.fetch().catch(error => {
        console.warn('[TempVoice] Could not fetch application emojis; using Unicode button emojis:', error.message);
        return null;
      })
    );
  }

  return applicationEmojiCache.get(client);
}

async function buildTempVoicePanel(client) {
  const emojis = await fetchApplicationEmojis(client);
  const embed = new EmbedBuilder()
    .setColor('#222222')
    .setDescription([
      '## TempVoice Interface'
      'This **interface** can be used to manage temporary voice channels.',
    ].join('\n'))
    .setImage(`attachment://${BUTTON_GUIDE_NAME}`)
    .setFooter({
      text: 'Press the buttons below to use the interface',
      ...(client.user?.displayAvatarURL ? { iconURL: client.user.displayAvatarURL() } : {})
    });

  const components = buttonRows.map(row =>
    new ActionRowBuilder().addComponents(
      ...row.map(action => {
        const emojiName = applicationEmojiNames[action];
        const applicationEmoji = emojis?.find(emoji => emoji.name === emojiName);
        if (emojis && !applicationEmoji && !warnedMissingEmojiNames.has(emojiName)) {
          warnedMissingEmojiNames.add(emojiName);
          console.warn(`[TempVoice] Application emoji "${emojiName}" for "${action}" was not found; using its Unicode fallback.`);
        }

        const button = new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIX}${action}`)
          .setStyle(ButtonStyle.Secondary);

        if (applicationEmoji) {
          button.setEmoji({
            id: applicationEmoji.id,
            name: applicationEmoji.name,
            animated: applicationEmoji.animated
          });
        } else {
          button.setEmoji(fallbackEmojis[action]);
        }

        return button;
      })
    )
  );

  const files = [new AttachmentBuilder(BUTTON_GUIDE_PATH, { name: BUTTON_GUIDE_NAME })];
  return { embed, components, files };
}

async function replyPrivate(interaction, content, extra = {}) {
  const payload = { content, ephemeral: true, ...extra };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

async function getRoomContext(interaction, channelId) {
  const guild = interaction.guild;
  const member = interaction.member;
  const currentChannel = member?.voice?.channel;

  if (!guild || !currentChannel || (channelId && currentChannel.id !== channelId)) {
    return { error: 'Join the temporary voice channel you want to manage first.' };
  }

  if (currentChannel.type !== ChannelType.GuildVoice) {
    return { error: 'This control only works in a temporary voice channel.' };
  }

  const record = await TemporaryChannelModel.findOne({
    channelId: currentChannel.id,
    isTemporary: true
  });

  if (!record) {
    return { error: 'This voice channel is not managed by TempVoice.' };
  }

  return { guild, member, channel: currentChannel, record };
}

function userIds(record, key) {
  return Array.isArray(record[key]) ? [...record[key]] : [];
}

async function syncMemberPermissions(channel, record, userId) {
  if (userId === record.userId) {
    return channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
      MoveMembers: true
    });
  }

  if (userIds(record, 'blockedUserIds').includes(userId)) {
    return channel.permissionOverwrites.edit(userId, {
      ViewChannel: false,
      Connect: false,
      ManageChannels: false,
      MoveMembers: false
    });
  }

  if (userIds(record, 'trustedUserIds').includes(userId)) {
    return channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: false,
      MoveMembers: false
    });
  }

  const overwrite = channel.permissionOverwrites.cache.get(userId);
  if (overwrite) {
    await channel.permissionOverwrites.edit(userId, {
      ViewChannel: null,
      Connect: null,
      Speak: null,
      ManageChannels: null,
      MoveMembers: null
    });
  }
}

async function changeOwner(channel, record, newOwnerId) {
  const oldOwnerId = record.userId;
  record.blockedUserIds = userIds(record, 'blockedUserIds').filter(id => id !== newOwnerId);
  record.trustedUserIds = userIds(record, 'trustedUserIds').filter(id => id !== newOwnerId);
  await channel.permissionOverwrites.edit(newOwnerId, {
    ViewChannel: true,
    Connect: true,
    Speak: true,
    ManageChannels: true,
    MoveMembers: true
  });
  record.userId = newOwnerId;
  await record.save();
  await syncMemberPermissions(channel, record, oldOwnerId);
}

async function showUserPicker(interaction, action, channel) {
  const prompts = {
    trust: 'Choose a member to trust',
    untrust: 'Choose a member to remove from your trusted list',
    kick: 'Choose a member to disconnect',
    block: 'Choose a member to block from the room',
    unblock: 'Choose a member to unblock',
    transfer: 'Choose the new room owner'
  };

  const picker = new UserSelectMenuBuilder()
    .setCustomId(`${SELECT_PREFIX}${action}_${channel.id}`)
    .setPlaceholder(prompts[action])
    .setMinValues(1)
    .setMaxValues(1);

  return interaction.reply({
    content: prompts[action],
    components: [new ActionRowBuilder().addComponents(picker)],
    ephemeral: true
  });
}

async function toggleWaitingRoom(guild, channel, record) {
  const botMember = guild.members.me;
  if (!botMember ||
      !channel.permissionsFor(botMember)?.has(Flags.ManageChannels) ||
      !channel.permissionsFor(botMember)?.has(Flags.MoveMembers)) {
    throw new Error('The bot needs Manage Channels and Move Members permissions to manage a waiting room.');
  }

  if (record.waitingRoomEnabled) {
    record.waitingRoomEnabled = false;
    const waitingChannel = record.waitingRoomChannelId
      ? guild.channels.cache.get(record.waitingRoomChannelId)
      : null;
    if (waitingChannel?.members.size === 0) {
      await waitingChannel.delete('TempVoice waiting room disabled');
      record.waitingRoomChannelId = null;
    }
    await record.save();
    return waitingChannel?.members.size
      ? 'Waiting room is off. Current guests can remain there until they leave.'
      : 'Waiting room is now off.';
  }

  let waitingChannel = record.waitingRoomChannelId
    ? guild.channels.cache.get(record.waitingRoomChannelId)
    : null;

  if (!waitingChannel) {
    waitingChannel = await guild.channels.create({
      name: `⏳ ${channel.name}・waiting`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: channel.parentId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [Flags.ViewChannel, Flags.Connect, Flags.Speak]
        },
        {
          id: record.userId,
          allow: [Flags.ViewChannel, Flags.Connect, Flags.Speak, Flags.MoveMembers, Flags.ManageChannels]
        }
      ],
      reason: `TempVoice waiting room for ${channel.id}`
    });
    record.waitingRoomChannelId = waitingChannel.id;
  }

  record.waitingRoomEnabled = true;
  await record.save();
  return 'Waiting room is on. Guests who join your room will be moved there for approval.';
}

async function handleButton(interaction) {
  const action = interaction.customId.slice(BUTTON_PREFIX.length);
  const context = await getRoomContext(interaction);
  if (context.error) {
    await replyPrivate(interaction, context.error);
    return;
  }

  const { guild, member, channel, record } = context;
  if (action === 'claim') {
    if (record.userId === member.id) {
      await replyPrivate(interaction, 'You already own this room.');
      return;
    }
    if (channel.members.has(record.userId)) {
      await replyPrivate(interaction, 'The current owner is still in the room. Ask them to transfer ownership.');
      return;
    }
    await changeOwner(channel, record, member.id);
    await replyPrivate(interaction, 'You are now the owner of this room.');
    return;
  }

  if (record.userId !== member.id) {
    await replyPrivate(interaction, 'Only the room owner can use this control.');
    return;
  }

  if (action === 'name' || action === 'limit') {
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}${action}_${channel.id}`)
      .setTitle(action === 'name' ? 'Rename your voice room' : 'Set the room user limit');

    const input = new TextInputBuilder()
      .setCustomId('value')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    if (action === 'name') {
      input
        .setLabel('Room name')
        .setPlaceholder('Leave empty to reset the name')
        .setRequired(false)
        .setMaxLength(100);
      if (channel.name) input.setValue(channel.name);
    } else {
      input
        .setLabel('Maximum members (0 = unlimited)')
        .setPlaceholder('0–99')
        .setMaxLength(2)
        .setValue(String(channel.userLimit));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (['trust', 'untrust', 'kick', 'block', 'unblock', 'transfer'].includes(action)) {
    await showUserPicker(interaction, action, channel);
    return;
  }

  if (action === 'region') {
    const regionMenu = new StringSelectMenuBuilder()
      .setCustomId(`tempvoice_region_${channel.id}`)
      .setPlaceholder('Choose a voice region')
      .addOptions(
        { label: 'Automatic', value: 'auto' },
        { label: 'Brazil', value: 'brazil' },
        { label: 'Hong Kong', value: 'hongkong' },
        { label: 'India', value: 'india' },
        { label: 'Japan', value: 'japan' },
        { label: 'Rotterdam', value: 'rotterdam' },
        { label: 'Russia', value: 'russia' },
        { label: 'Singapore', value: 'singapore' },
        { label: 'South Africa', value: 'southafrica' },
        { label: 'Sydney', value: 'sydney' },
        { label: 'US Central', value: 'us-central' },
        { label: 'US East', value: 'us-east' },
        { label: 'US South', value: 'us-south' },
        { label: 'US West', value: 'us-west' }
      );
    await interaction.reply({
      content: 'Choose a voice region:',
      components: [new ActionRowBuilder().addComponents(regionMenu)],
      ephemeral: true
    });
    return;
  }

  switch (action) {
    case 'privacy': {
      record.isPrivate = !record.isPrivate;
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: true,
        Connect: !record.isPrivate
      });
      await syncMemberPermissions(channel, record, member.id);
      await record.save();
      await replyPrivate(interaction, `Room privacy is now ${record.isPrivate ? 'on' : 'off'}.`);
      break;
    }
    case 'waiting_room': {
      const message = await toggleWaitingRoom(guild, channel, record);
      await replyPrivate(interaction, message);
      break;
    }
    case 'chat': {
      const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const chatIsDisabled = everyoneOverwrite?.deny.has(Flags.SendMessages) || false;
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: chatIsDisabled
      });
      record.chatEnabled = chatIsDisabled;
      await record.save();
      await replyPrivate(interaction, `Voice channel text chat is now ${chatIsDisabled ? 'on' : 'off'}.`);
      break;
    }
    case 'invite': {
      const invite = await channel.createInvite({
        maxAge: 60 * 60,
        maxUses: 0,
        reason: `Invite created by TempVoice owner ${member.id}`
      });
      const privacyNote = record.isPrivate
        ? ' The room is private, so the link alone will not grant access.'
        : '';
      await replyPrivate(interaction, `Room invite (valid for 1 hour): ${invite.url}${privacyNote}`);
      break;
    }
    case 'delete': {
      const waitingChannel = record.waitingRoomChannelId
        ? guild.channels.cache.get(record.waitingRoomChannelId)
        : null;
      if (waitingChannel) await waitingChannel.delete('TempVoice room deleted by its owner');
      await channel.delete('TempVoice room deleted by its owner');
      await TemporaryChannelModel.deleteOne({ channelId: channel.id });
      await replyPrivate(interaction, 'Your temporary room has been deleted.');
      break;
    }
    default:
      await replyPrivate(interaction, 'This TempVoice control is not available.');
  }
}

async function handleModal(interaction) {
  const match = interaction.customId.match(/^tempvoice_modal_(name|limit)_(.+)$/);
  if (!match) return;

  const [, action, channelId] = match;
  const context = await getRoomContext(interaction, channelId);
  if (context.error) {
    await replyPrivate(interaction, context.error);
    return;
  }
  const { channel, member, record } = context;
  if (record.userId !== member.id) {
    await replyPrivate(interaction, 'Only the room owner can change this setting.');
    return;
  }

  const value = interaction.fields.getTextInputValue('value').trim();
  if (action === 'name') {
    const name = value || `${member.displayName}'s channel`;
    await channel.setName(name.slice(0, 100));
    record.name = name.slice(0, 100);
    await record.save();
    await replyPrivate(interaction, `Updated! Your room is now named **${record.name}**.`);
    return;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
    await replyPrivate(interaction, 'Enter a whole number from 0 to 99. Use 0 for unlimited.');
    return;
  }

  await channel.setUserLimit(limit);
  await replyPrivate(interaction, `Room limit set to ${limit === 0 ? 'unlimited' : limit}.`);
}

async function handleUserSelection(interaction) {
  const match = interaction.customId.match(/^tempvoice_select_(trust|untrust|kick|block|unblock|transfer)_(.+)$/);
  if (!match) return;

  const [, action, channelId] = match;
  const context = await getRoomContext(interaction, channelId);
  if (context.error) {
    await replyPrivate(interaction, context.error);
    return;
  }
  const { guild, member, channel, record } = context;
  if (record.userId !== member.id) {
    await replyPrivate(interaction, 'Only the room owner can use this control.');
    return;
  }

  const targetId = interaction.values[0];
  if (targetId === member.id) {
    await replyPrivate(interaction, 'You cannot select yourself for this action.');
    return;
  }

  const target = await guild.members.fetch(targetId).catch(() => null);
  if (!target) {
    await replyPrivate(interaction, 'That member is no longer in this server.');
    return;
  }

  if (action === 'kick') {
    const voiceMember = channel.members.get(targetId);
    if (!voiceMember) {
      await replyPrivate(interaction, 'That member is not in your room.');
      return;
    }
    await voiceMember.voice.disconnect('Disconnected by the TempVoice room owner');
    await replyPrivate(interaction, `${target.user.username} was disconnected from your room.`);
    return;
  }

  if (action === 'transfer') {
    if (!channel.members.has(targetId)) {
      await replyPrivate(interaction, 'The new owner must be in your room.');
      return;
    }
    await changeOwner(channel, record, targetId);
    await replyPrivate(interaction, `Room ownership transferred to ${target.user.username}.`);
    return;
  }

  const trusted = userIds(record, 'trustedUserIds');
  const blocked = userIds(record, 'blockedUserIds');

  if (action === 'trust') {
    if (trusted.includes(targetId)) {
      await replyPrivate(interaction, `${target.user.username} is already trusted.`);
      return;
    }
    record.trustedUserIds = [...trusted, targetId];
    record.blockedUserIds = blocked.filter(id => id !== targetId);
    await syncMemberPermissions(channel, record, targetId);
    await record.save();
    await replyPrivate(interaction, `${target.user.username} can now join your room.`);
    return;
  }

  if (action === 'untrust') {
    if (!trusted.includes(targetId)) {
      await replyPrivate(interaction, `${target.user.username} is not on your trusted list.`);
      return;
    }
    record.trustedUserIds = trusted.filter(id => id !== targetId);
    await syncMemberPermissions(channel, record, targetId);
    await record.save();
    await replyPrivate(interaction, `${target.user.username} was removed from your trusted list.`);
    return;
  }

  if (action === 'block') {
    record.blockedUserIds = [...new Set([...blocked, targetId])];
    record.trustedUserIds = trusted.filter(id => id !== targetId);
    await syncMemberPermissions(channel, record, targetId);
    await record.save();
    if (channel.members.has(targetId)) {
      await guild.members.cache.get(targetId)?.voice.disconnect('Blocked by the TempVoice room owner');
    }
    await replyPrivate(interaction, `${target.user.username} is blocked from your room.`);
    return;
  }

  if (action === 'unblock') {
    if (!blocked.includes(targetId)) {
      await replyPrivate(interaction, `${target.user.username} is not blocked.`);
      return;
    }
    record.blockedUserIds = blocked.filter(id => id !== targetId);
    await syncMemberPermissions(channel, record, targetId);
    await record.save();
    await replyPrivate(interaction, `${target.user.username} is unblocked.`);
  }
}

async function handleRegionSelection(interaction) {
  const match = interaction.customId.match(/^tempvoice_region_(.+)$/);
  if (!match) return;

  const context = await getRoomContext(interaction, match[1]);
  if (context.error) {
    await replyPrivate(interaction, context.error);
    return;
  }
  if (context.record.userId !== context.member.id) {
    await replyPrivate(interaction, 'Only the room owner can change the region.');
    return;
  }

  const region = interaction.values[0];
  await context.channel.setRTCRegion(region === 'auto' ? null : region);
  await replyPrivate(interaction, `Voice region set to ${region === 'auto' ? 'Automatic' : region}.`);
}

async function handle(interaction) {
  const customId = interaction.customId;
  if (typeof customId !== 'string' || !customId.startsWith('tempvoice_')) return false;

  try {
    if (interaction.isButton() && customId.startsWith(BUTTON_PREFIX)) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit() && customId.startsWith(MODAL_PREFIX)) {
      await handleModal(interaction);
    } else if (interaction.isUserSelectMenu() && customId.startsWith(SELECT_PREFIX)) {
      await handleUserSelection(interaction);
    } else if (interaction.isStringSelectMenu() && customId.startsWith('tempvoice_region_')) {
      await handleRegionSelection(interaction);
    }
  } catch (error) {
    console.error('Error handling TempVoice interaction:', error);
    await replyPrivate(interaction, error.message || 'Something went wrong while managing your room.')
      .catch(() => {});
  }

  return true;
}

module.exports = { buildTempVoicePanel, handle };
