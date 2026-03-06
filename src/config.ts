export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  mcpServerUrl: process.env.MCP_SERVER_URL || "http://localhost:3100",
  productclankApiUrl:
    process.env.PRODUCTCLANK_API_URL || "https://api.productclank.com/api/v1",
  oauth: {
    issuer: process.env.OAUTH_ISSUER || "http://localhost:3100",
    dynamicRegistrationEnabled:
      process.env.OAUTH_CLIENT_REGISTRATION_ENABLED !== "false",
    sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  },
};
