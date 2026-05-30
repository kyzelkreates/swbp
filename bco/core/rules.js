// BCO Core — Run 2: Rule Engine
// Evaluates registered module rules against incoming events.
// Replaces the Run 1 placeholder.
// Rule 6: Event → Rules → Actions → State → UI

import { storage, SSOT_KEYS } from "./storage.js";
import { createAction } from "./actions.js";

/**
 * evaluateRules(event)
 * Iterates all registered modules, runs their rules against the event,
 * and returns an array of generated actions.
 */
export function evaluateRules(event) {
  const modules = storage.get(SSOT_KEYS.MODULES) || [];
  const actions = [];

  modules.forEach((module) => {
    (module.rules || []).forEach((rule) => {
      if (evaluateCondition(rule.condition, event)) {
        const action = createAction(
          rule.action.type,
          rule.action.payload,
          event.id
        );

        action.priority = rule.priority || "normal";
        action.module = module.name;

        actions.push(action);
      }
    });
  });

  return actions;
}

/**
 * evaluateCondition(condition, event)
 * Composable condition evaluator.
 * Supports: EVENT_TYPE_EQUALS, MODULE_EQUALS, PAYLOAD_FIELD_EQUALS,
 *           THRESHOLD_GREATER_THAN, AND, OR
 */
export function evaluateCondition(condition, event) {
  switch (condition.type) {
    case "EVENT_TYPE_EQUALS":
      return event.type === condition.value;

    case "MODULE_EQUALS":
      return event.module === condition.value;

    case "PAYLOAD_FIELD_EQUALS":
      return event.payload?.[condition.field] === condition.value;

    case "THRESHOLD_GREATER_THAN":
      return event.payload?.[condition.field] > condition.value;

    case "AND":
      return condition.rules.every((r) => evaluateCondition(r, event));

    case "OR":
      return condition.rules.some((r) => evaluateCondition(r, event));

    default:
      console.warn(`[BCO Rules] Unknown condition type: "${condition.type}"`);
      return false;
  }
}
