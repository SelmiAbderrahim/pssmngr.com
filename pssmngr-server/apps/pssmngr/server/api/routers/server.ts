import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const serverRouter = createTRPCRouter({
	count: protectedProcedure.query(() => 0),

	getServerTime: publicProcedure.query(() => ({
		time: new Date().toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
	})),
});
