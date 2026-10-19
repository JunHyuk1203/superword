const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret, defineString} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {AiError, createAiService} = require('./ai-service.cjs');

initializeApp();
const aiKey = defineSecret('AI_API_KEY');
const aiModel = defineString('AI_MODEL', {default: 'gemini-3.1-flash-lite'});

exports.studyAi = onCall({
  region: 'asia-northeast3', secrets: [aiKey], timeoutSeconds: 60,
  serviceAccount: 'superword-ai-runtime@goodnotesword-454fa.iam.gserviceaccount.com',
  maxInstances: 2, concurrency: 20, memory: '256MiB',
  // App Check requires site registration first. Auth + quotas are always enforced.
  enforceAppCheck: false,
  cors: ['https://junhyuk1203.github.io', /^https?:\/\/localhost(?::\d+)?$/]
}, async request => {
  try {
    const service = createAiService({db: getFirestore(), getKey: () => aiKey.value(), model: aiModel.value()});
    return await service(request);
  } catch (error) {
    if (error instanceof AiError) throw new HttpsError(error.code, error.message);
    // Do not log or return raw provider errors, request contents, or the secret.
    throw new HttpsError('internal', 'AI 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
});
