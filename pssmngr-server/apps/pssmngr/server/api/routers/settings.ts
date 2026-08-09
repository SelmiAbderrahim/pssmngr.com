import { IS_CLOUD } from "@pssmngr/server/constants";
import packageJson from "../../../package.json";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const settingsRouter = createTRPCRouter({
	isCloud: publicProcedure.query(() => IS_CLOUD),

	getPssmngrVersion: publicProcedure.query(() => packageJson.version),
});
