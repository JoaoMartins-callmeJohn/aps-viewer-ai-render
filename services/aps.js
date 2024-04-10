const APS = require('forge-apis');
const fetch = require('node-fetch');
const fs = require('fs');
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_CALLBACK_URL, INTERNAL_TOKEN_SCOPES, PUBLIC_TOKEN_SCOPES, COMFY_KEY } = require('../config.js');

const internalAuthClient = new APS.AuthClientThreeLegged(APS_CLIENT_ID, APS_CLIENT_SECRET, APS_CALLBACK_URL, INTERNAL_TOKEN_SCOPES);
const internalAuthClient2LO = new APS.AuthClientTwoLegged(APS_CLIENT_ID, APS_CLIENT_SECRET, INTERNAL_TOKEN_SCOPES, true);
const publicAuthClient = new APS.AuthClientThreeLegged(APS_CLIENT_ID, APS_CLIENT_SECRET, APS_CALLBACK_URL, PUBLIC_TOKEN_SCOPES);

const service = module.exports = {};

service.getAuthorizationUrl = () => internalAuthClient.generateAuthUrl();

service.authCallbackMiddleware = async (req, res, next) => {
    const internalCredentials = await internalAuthClient.getToken(req.query.code);
    const publicCredentials = await publicAuthClient.refreshToken(internalCredentials);
    req.session.public_token = publicCredentials.access_token;
    req.session.internal_token = internalCredentials.access_token;
    req.session.refresh_token = publicCredentials.refresh_token;
    req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
    next();
};

service.authRefreshMiddleware = async (req, res, next) => {
    const { refresh_token, expires_at } = req.session;
    if (!refresh_token) {
        res.status(401).end();
        return;
    }

    if (expires_at < Date.now()) {
        const internalCredentials = await internalAuthClient.refreshToken({ refresh_token });
        const publicCredentials = await publicAuthClient.refreshToken(internalCredentials);
        req.session.public_token = publicCredentials.access_token;
        req.session.internal_token = internalCredentials.access_token;
        req.session.refresh_token = publicCredentials.refresh_token;
        req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
    }
    req.internalOAuthToken = {
        access_token: req.session.internal_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000)
    };
    req.publicOAuthToken = {
        access_token: req.session.public_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000)
    };
    next();
};

service.getInternalToken = async () => {
    if (!internalAuthClient2LO.isAuthorized()) {
        await internalAuthClient2LO.authenticate();
    }
    return internalAuthClient2LO.getCredentials();
};

service.getUserProfile = async (token) => {
    const resp = await new APS.UserProfileApi().getUserProfile(internalAuthClient, token);
    return resp.body;
};

service.getHubs = async (token) => {
  const resp = await new APS.HubsApi().getHubs(null, internalAuthClient, token);
  return resp.body.data;
};

service.getProjects = async (hubId, token) => {
  const resp = await new APS.ProjectsApi().getHubProjects(hubId, null, internalAuthClient, token);
  return resp.body.data;
};

service.getProjectContents = async (hubId, projectId, folderId, token) => {
  if (!folderId) {
      const resp = await new APS.ProjectsApi().getProjectTopFolders(hubId, projectId, internalAuthClient, token);
      return resp.body.data;
  } else {
      const resp = await new APS.FoldersApi().getFolderContents(projectId, folderId, null, internalAuthClient, token);
      return resp.body.data;
  }
};

service.getItemVersions = async (projectId, itemId, token) => {
  const resp = await new APS.ItemsApi().getItemVersions(projectId, itemId, null, internalAuthClient, token);
  return resp.body.data;
};

service.runWorkflow = async (workflowId, positiveprompt, negativePrompt) => {
    const url = "https://comfy.icu/api/v1/workflows/"+workflowId+"/runs";
    const prompt = {
        "prompt": {
            "3": {
                "_meta": {
                    "title": "KSampler"
                },
                "inputs": {
                    "cfg": 8,
                    "seed": 597368515889542,
                    "model": [
                        "4",
                        0
                    ],
                    "steps": 20,
                    "denoise": 1,
                    "negative": [
                        "7",
                        0
                    ],
                    "positive": [
                        "6",
                        0
                    ],
                    "scheduler": "normal",
                    "latent_image": [
                        "5",
                        0
                    ],
                    "sampler_name": "euler"
                },
                "class_type": "KSampler"
            },
            "4": {
                "_meta": {
                    "title": "Load Checkpoint"
                },
                "inputs": {
                    "ckpt_name": "architecturerealmix_v1repair.safetensors"
                },
                "class_type": "CheckpointLoaderSimple"
            },
            "5": {
                "_meta": {
                    "title": "Empty Latent Image"
                },
                "inputs": {
                    "width": 512,
                    "height": 512,
                    "batch_size": 1
                },
                "class_type": "EmptyLatentImage"
            },
            "6": {
                "_meta": {
                    "title": "CLIP Text Encode (Prompt)"
                },
                "inputs": {
                    "clip": [
                        "4",
                        1
                    ],
                    "text": positiveprompt
                },
                "class_type": "CLIPTextEncode"
            },
            "7": {
                "_meta": {
                    "title": "CLIP Text Encode (Prompt)"
                },
                "inputs": {
                    "clip": [
                        "4",
                        1
                    ],
                    "text": negativePrompt
                },
                "class_type": "CLIPTextEncode"
            },
            "8": {
                "_meta": {
                    "title": "VAE Decode"
                },
                "inputs": {
                    "vae": [
                        "4",
                        2
                    ],
                    "samples": [
                        "3",
                        0
                    ]
                },
                "class_type": "VAEDecode"
            },
            "9": {
                "_meta": {
                    "title": "Save Image"
                },
                "inputs": {
                    "images": [
                        "8",
                        0
                    ],
                    "filename_prefix": "ComfyUI"
                },
                "class_type": "SaveImage"
            }
        }
    };
    const resp = await fetch(url, {
        "headers": {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": "Bearer " + COMFY_KEY
        },
        "body": JSON.stringify(prompt),
        "method": "POST"
    });
    return await resp.json();
}

service.getWorkflowRunStatus = async (workflowId, runId) => {
    const url = "https://comfy.icu/api/v1/workflows/"+workflowId+"/runs/"+runId
    const resp = await fetch(url, {
        "headers": {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": "Bearer " + COMFY_KEY
        }
    });
    return await resp.json();
}

service.ensureBucketExists = async (bucketKey) => {
    try {
        await new APS.BucketsApi().getBucketDetails(bucketKey, null, await service.getInternalToken());
    } catch (err) {
        if (err.response.status === 404) {
            await new APS.BucketsApi().createBucket({ bucketKey, policyKey: 'persistent' }, {}, null, await service.getInternalToken());
        } else {
            throw err;
        }
    }
};

service.listObjects = async (bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    let resp = await new APS.ObjectsApi().getObjects(bucketKey, { limit: 64 }, null, await service.getInternalToken());
    let objects = resp.body.items;
    while (resp.body.next) {
        const startAt = new URL(resp.body.next).searchParams.get('startAt');
        resp = await new APS.ObjectsApi().getObjects(bucketKey, { limit: 64, startAt }, null, await service.getInternalToken());
        objects = objects.concat(resp.body.items);
    }
    return objects;
};

service.uploadObject = async (objectName, filePath, bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    const buffer = await fs.promises.readFile(filePath);
    const results = await new APS.ObjectsApi().uploadResources(
        bucketKey,
        [{ objectKey: objectName, data: buffer }],
        { useAcceleration: false, minutesExpiration: 15 },
        null,
        await service.getInternalToken()
    );
    if (results[0].error) {
        throw results[0].completed;
    } else {
        return results[0].completed;
    }
};

service.uploadObjectWithBuffer = async (objectName, buffer, bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    const results = await new APS.ObjectsApi().uploadResources(
        bucketKey,
        [{ objectKey: objectName, data: buffer }],
        { useAcceleration: false, minutesExpiration: 15 },
        null,
        await service.getInternalToken()
    );
    if (results[0].error) {
        throw results[0].completed;
    } else {
        return results[0].completed;
    }
};

service.getSignedURL = async (bucketKey, objectName) => {
    await service.ensureBucketExists(bucketKey);
    var authToken = await service.getInternalToken();
    var url = await new APS.ObjectsApi().createSignedResource(bucketKey, objectName, { minutesExpiration: 30 }, {access:'read'}, internalAuthClient2LO, authToken);
    return url;
};

service.urnify = (id) => Buffer.from(id).toString('base64').replace(/=/g, '');