import crypto from "node:crypto";

const SERVICE = "ProductAdvertisingAPI";
const REGION = process.env.AMAZON_REGION || "us-east-1";
const HOST = process.env.AMAZON_PAAPI_HOST || "webservices.amazon.com";
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function hash(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${key}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function formatAmzDate(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

export async function searchAmazonItems({ keywords, searchIndex = "All", itemCount = 6 }) {
  const accessKey = process.env.AMAZON_ACCESS_KEY || "";
  const secretKey = process.env.AMAZON_SECRET_KEY || "";
  const partnerTag = process.env.AMAZON_PARTNER_TAG || "";
  if (!accessKey || !secretKey || !partnerTag) {
    throw new Error("amazon_paapi_not_configured");
  }
  const amzDate = formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payload = JSON.stringify({
    Keywords: keywords,
    SearchIndex: searchIndex,
    ItemCount: itemCount,
    PartnerTag: partnerTag,
    PartnerType: "Associates",
    Resources: [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "ItemInfo.Features",
      "Offers.Listings.Price"
    ]
  });
  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${HOST}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`;
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    "/paapi5/searchitems",
    "",
    canonicalHeaders,
    signedHeaders,
    hash(payload)
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join("\n");
  const signingKey = getSignatureKey(secretKey, dateStamp, REGION, SERVICE);
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "amz-1.0",
      "x-amz-date": amzDate,
      "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
      Authorization: authorizationHeader
    },
    body: payload
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.Errors?.[0]?.Message || "amazon_paapi_request_failed");
  }
  const items = (data?.SearchResult?.Items || []).map(item => ({
    asin: item.ASIN,
    title: item?.ItemInfo?.Title?.DisplayValue,
    image: item?.Images?.Primary?.Medium?.URL,
    price: item?.Offers?.Listings?.[0]?.Price?.DisplayAmount,
    url: item?.DetailPageURL
  }));
  return { items, raw: data };
}
