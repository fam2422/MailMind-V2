const prisma = require('../config/prisma');
const localAiService = require('./ai/local');


exports.getUserSettings = async (userId) => {
  const setting = await prisma.userSetting.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const activeModel = setting.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:latest';

  const configuredKeys = {
    local: true,
  };

  return {
    setting: {
      ...setting,
      defaultModel: activeModel,
    },
    configuredKeys,
    activeModel,
  };
};

exports.updateUserSettings = async (userId, data) => {
  return await prisma.userSetting.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...data
    },
  });
};

exports.saveProviderApiKey = async (userId, provider, apiKey) => {
  return `บันทึกการตั้งค่า ${provider} เรียบร้อย`;
};

exports.deleteProviderApiKey = async (userId, provider) => {
  return `ลบการตั้งค่าเรียบร้อย`;
};

exports.testProviderApiKey = async (provider, apiKey, modelName) => {
  const targetModel = modelName || process.env.LOCAL_AI_MODEL || 'llama3.1:latest';
  await localAiService.testKey(apiKey, targetModel);
  return `✅ เชื่อมต่อ Local AI (${targetModel}) สำเร็จ!`;
};

exports.toggleAiStatus = async (userId, isAutoReplyActive) => {
  const setting = await prisma.userSetting.upsert({
    where: { userId },
    update: { isAutoReplyActive },
    create: {
      userId,
      isAutoReplyActive
    },
    select: { isAutoReplyActive: true }
  });
  return setting;
};

exports.checkUserHasAnyKey = async (userId) => {
  return true; // Local AI is enabled by default
};