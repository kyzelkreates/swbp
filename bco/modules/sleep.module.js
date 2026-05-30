// BCO Module — Sleep (Example / Reference Implementation)
// Demonstrates the full Run 3 module contract.
// Register with: moduleRegistry.register(sleepModule)

export const sleepModule = {
  name: "sleep",
  version: "1.0",

  entities: ["sleep_sessions", "sleep_scores"],

  actions: [
    "LOG_SLEEP",
    "UPDATE_SLEEP_SCORE"
  ],

  rules: [
    {
      id: "sleep_low_score_alert",
      name: "Low sleep score alert",
      priority: "high",
      condition: {
        type: "THRESHOLD_GREATER_THAN",  // NOTE: fires when score < threshold (invert in Run 4 UI)
        field: "sleep_score",
        value: 60
      },
      action: {
        type: "CREATE_ALERT",
        payload: {
          severity: "warning",
          message: "Low sleep quality detected",
          module: "sleep"
        }
      }
    }
  ],

  ui_blocks: [
    {
      id: "sleep_chart",
      type: "chart",
      dataSource: "sleep_sessions",
      permissions: ["user", "admin"]
    },
    {
      id: "sleep_score_card",
      type: "card",
      dataSource: "sleep_scores",
      permissions: ["user", "admin"]
    }
  ],

  permissions: {
    read: ["user", "admin"],
    write: ["user", "admin"],
    blockedActions: []
  },

  config: {}
};
