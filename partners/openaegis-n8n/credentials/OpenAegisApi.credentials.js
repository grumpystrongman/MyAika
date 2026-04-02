export class OpenAegisApi {
  name = "openAegisApi";
  displayName = "OpenAegis API";
  properties = [
    { displayName: "Base URL", name: "baseUrl", type: "string", default: "http://127.0.0.1:8787" },
    { displayName: "API Key", name: "apiKey", type: "string", typeOptions: { password: true }, default: "" }
  ];
}
