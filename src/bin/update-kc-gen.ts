import type { BuildContext } from "./shared/buildContext";
import * as fs from "fs/promises";
import { join as pathJoin } from "path";
import { existsAsync } from "./tools/fs.existsAsync";
import { maybeDelegateCommandToCustomHandler } from "./shared/customHandler_delegate";
import * as crypto from "crypto";
import { getIsPrettierAvailable, runPrettier } from "./tools/runPrettier";

export async function command(params: { buildContext: BuildContext }) {
    const { buildContext } = params;

    const { hasBeenHandled } = maybeDelegateCommandToCustomHandler({
        commandName: "update-kc-gen",
        buildContext
    });

    if (hasBeenHandled) {
        return;
    }

    const filePath = pathJoin(buildContext.themeSrcDirPath, "kc-gen.tsx");

    const hasLoginTheme = buildContext.implementedThemeTypes.login.isImplemented;
    const hasAccountTheme = buildContext.implementedThemeTypes.account.isImplemented;
    const hasAdminTheme = buildContext.implementedThemeTypes.admin.isImplemented;

    let newContent = [
        ``,
        `/* eslint-disable */`,
        ``,
        `// @ts-nocheck`,
        ``,
        `// noinspection JSUnusedGlobalSymbols`,
        ``,
        `import { lazy, Suspense, type ReactNode } from "react";`,
        ``,
        `export type ThemeName = ${buildContext.themeNames.map(themeName => `"${themeName}"`).join(" | ")};`,
        ``,
        `export const themeNames: ThemeName[] = [${buildContext.themeNames.map(themeName => `"${themeName}"`).join(", ")}];`,
        ``,
        `export type KcEnvName = ${buildContext.environmentVariables.length === 0 ? "never" : buildContext.environmentVariables.map(({ name }) => `"${name}"`).join(" | ")};`,
        ``,
        `export const kcEnvNames: KcEnvName[] = [${buildContext.environmentVariables.map(({ name }) => `"${name}"`).join(", ")}];`,
        ``,
        `export const kcEnvDefaults: Record<KcEnvName, string> = ${JSON.stringify(
            Object.fromEntries(
                buildContext.environmentVariables.map(
                    ({ name, default: defaultValue }) => [name, defaultValue]
                )
            ),
            null,
            2
        )};`,
        ``,
        `export type KcContext =`,
        hasLoginTheme && `    | import("./login/KcContext").KcContext`,
        hasAccountTheme && `    | import("./account/KcContext").KcContext`,
        hasAdminTheme && `    | import("./admin/KcContext").KcContext`,
        `    ;`,
        ``,
        `declare global {`,
        `    interface Window {`,
        `        kcContext?: KcContext;`,
        `    }`,
        `}`,
        ``,
        hasLoginTheme &&
            `export const KcLoginPage = lazy(() => import("./login/KcPage"));`,
        hasAccountTheme &&
            `export const KcAccountPage = lazy(() => import("./account/KcPage"));`,
        hasAdminTheme &&
            `export const KcAdminPage = lazy(() => import("./admin/KcPage"));`,
        ``,
        `export function KcPage(`,
        `    props: {`,
        `        kcContext: KcContext;`,
        `        fallback?: ReactNode;`,
        `    }`,
        `) {`,
        `    const { kcContext, fallback } = props;`,
        `    return (`,
        `        <Suspense fallback={fallback}>`,
        `            {(() => {`,
        `                switch (kcContext.themeType) {`,
        hasLoginTheme &&
            `                    case "login": return <KcLoginPage kcContext={kcContext} />;`,
        hasAccountTheme &&
            `                    case "account": return <KcAccountPage kcContext={kcContext} />;`,
        hasAdminTheme &&
            `                    case "admin": return <KcAdminPage kcContext={kcContext} />;`,
        `                }`,
        `            })()}`,
        `        </Suspense>`,
        `    );`,
        `}`,
        ``
    ]
        .filter(item => typeof item === "string")
        .join("\n");

    const hash = crypto.createHash("sha256").update(newContent).digest("hex");

    skip_if_no_changes: {
        if (!(await existsAsync(filePath))) {
            break skip_if_no_changes;
        }

        const currentContent = (await fs.readFile(filePath)).toString("utf8");

        if (!currentContent.includes(hash)) {
            break skip_if_no_changes;
        }

        return;
    }

    newContent = [
        `// This file is auto-generated by the \`update-kc-gen\` command. Do not edit it manually.`,
        `// Hash: ${hash}`,
        ``,
        newContent
    ].join("\n");

    format: {
        if (!(await getIsPrettierAvailable())) {
            break format;
        }

        newContent = await runPrettier({
            filePath,
            sourceCode: newContent
        });
    }

    await fs.writeFile(filePath, Buffer.from(newContent, "utf8"));

    delete_legacy_file: {
        const legacyFilePath = filePath.replace(/tsx$/, "ts");

        if (!(await existsAsync(legacyFilePath))) {
            break delete_legacy_file;
        }

        await fs.unlink(legacyFilePath);
    }
}
