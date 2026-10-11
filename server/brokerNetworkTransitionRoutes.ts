import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import {
  BrokerNetworkTransitionError,
  executeBrokerNetworkTransition,
  getBrokerNetworkTransitionContext,
  getBrokerNetworkTransitionHistory,
} from "./brokerNetworkTransitionService";

const transitionSchema = z
  .object({
    brokerId: z.string().min(1, "Broker requerido"),
    action: z.enum(["assign_master", "assign_platform", "promote_master"]),
    targetMasterBrokerId: z.string().min(1).nullable().optional(),
    reason: z.string().trim().min(3, "El motivo es obligatorio").max(1000),
    reactivate: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.action === "assign_master" && !data.targetMasterBrokerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetMasterBrokerId"],
        message: "Debes seleccionar el Master Broker destino",
      });
    }
    if (data.action !== "assign_master" && data.targetMasterBrokerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetMasterBrokerId"],
        message: "El Master Broker destino sólo aplica a una reasignación de red",
      });
    }
  });

function authUserId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || req.dbUser?.id || null;
}

function sendTransitionError(res: any, error: unknown) {
  if (error instanceof BrokerNetworkTransitionError) {
    return res.status(error.statusCode).json({ message: error.message, code: error.code });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      message: error.errors[0]?.message || "Datos inválidos",
      errors: error.errors,
    });
  }

  console.error("[BrokerNetworkTransition] Unexpected error:", error);
  return res.status(500).json({ message: "Error al procesar el cambio de red del broker." });
}

export function registerBrokerNetworkTransitionRoutes(app: Express) {
  app.get(
    "/api/admin/broker-network/transition-context/:brokerId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const actorUserId = authUserId(req);
        if (!actorUserId) return res.status(401).json({ message: "No autenticado" });

        const context = await getBrokerNetworkTransitionContext(actorUserId, req.params.brokerId);
        return res.json(context);
      } catch (error) {
        return sendTransitionError(res, error);
      }
    },
  );

  app.get(
    "/api/admin/broker-network/transitions/:brokerId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const actorUserId = authUserId(req);
        if (!actorUserId) return res.status(401).json({ message: "No autenticado" });

        const history = await getBrokerNetworkTransitionHistory(actorUserId, req.params.brokerId);
        return res.json({ history });
      } catch (error) {
        return sendTransitionError(res, error);
      }
    },
  );

  app.post("/api/admin/broker-network/transition", isAuthenticated, async (req: any, res) => {
    try {
      const actorUserId = authUserId(req);
      if (!actorUserId) return res.status(401).json({ message: "No autenticado" });

      const data = transitionSchema.parse(req.body);
      const result = await executeBrokerNetworkTransition({
        actorUserId,
        brokerId: data.brokerId,
        action: data.action,
        targetMasterBrokerId: data.targetMasterBrokerId,
        reason: data.reason,
        reactivate: data.reactivate,
      });

      return res.json({
        message:
          data.action === "promote_master"
            ? "Broker convertido en Master Broker correctamente."
            : "Asignación de red actualizada correctamente.",
        ...result,
      });
    } catch (error) {
      return sendTransitionError(res, error);
    }
  });
}
