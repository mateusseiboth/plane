/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import useSWR from "swr";
// plane internal packages
import { setPromiseToast, setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TInstanceConfigurationKeys, TInstanceAuthenticationModes } from "@plane/types";
import { Loader, ToggleSwitch } from "@plane/ui";
import { cn, resolveGeneralTheme } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { AuthenticationMethodCard } from "@/components/authentication/authentication-method-card";
// helpers
import { canDisableAuthMethod } from "@/helpers/authentication";
// hooks
import { useAuthenticationModes } from "@/hooks/oauth";
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";

const InstanceAuthenticationPage = observer(function InstanceAuthenticationPage(_props: Route.ComponentProps) {
  // theme
  const { resolvedTheme: resolvedThemeAdmin } = useTheme();
  const resolvedTheme = resolveGeneralTheme(resolvedThemeAdmin);
  // Ref to store authentication modes for validation (avoids circular dependency)
  const authenticationModesRef = useRef<TInstanceAuthenticationModes[]>([]);
  // state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // store hooks
  const { fetchInstanceConfigurations, formattedConfig, updateInstanceConfigurations } = useInstance();
  // derived values
  const enableSignUpConfig = formattedConfig?.ENABLE_SIGNUP ?? "";

  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  // Create updateConfig with validation - uses authenticationModesRef for current modes
  const updateConfig = useCallback(
    (key: TInstanceConfigurationKeys, value: string): void => {
      // Check if trying to disable (value === "0")
      if (value === "0") {
        // Check if this key is an authentication method key
        const currentAuthModes = authenticationModesRef.current;
        const isAuthMethodKey = currentAuthModes.some((method) => method.enabledConfigKey === key);

        // Only validate if this is an authentication method key
        if (isAuthMethodKey) {
          const canDisable = canDisableAuthMethod(key, currentAuthModes, formattedConfig);

          if (!canDisable) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "Não é possível desativar a autenticação",
              message:
                "Pelo menos um método de autenticação deve permanecer ativado. Ative outro método antes de desativar este.",
            });
            return;
          }
        }
      }

      // Proceed with the update
      setIsSubmitting(true);

      const payload = {
        [key]: value,
      };

      const updateConfigPromise = updateInstanceConfigurations(payload);

      setPromiseToast(updateConfigPromise, {
        loading: "Saving configuration",
        success: {
          title: "Sucesso",
          message: () => "Configuration saved successfully",
        },
        error: {
          title: "Erro",
          message: () => "Falha ao salvar a configuração",
        },
      });

      void updateConfigPromise
        .then(() => {
          setIsSubmitting(false);
          return undefined;
        })
        .catch((err) => {
          console.error(err);
          setIsSubmitting(false);
        });
    },
    [formattedConfig, updateInstanceConfigurations]
  );

  // Get authentication modes - this will use updateConfig which includes validation
  const authenticationModes = useAuthenticationModes({
    disabled: isSubmitting,
    updateConfig,
    resolvedTheme,
  });

  // Update ref with latest authentication modes
  authenticationModesRef.current = authenticationModes;

  return (
    <PageWrapper
      header={{
        title: "Gerencie os modos de autenticação da sua instância",
        description: "Configure os modos de autenticação da sua equipe e restrinja os cadastros apenas a convidados.",
      }}
    >
      {formattedConfig ? (
        <div className="space-y-3">
          <div className={cn("flex w-full items-center gap-14 rounded-sm")}>
            <div className="flex grow items-center gap-4">
              <div className="grow">
                <div className="pb-1 text-16 font-medium">Permitir que qualquer pessoa se cadastre mesmo sem convite</div>
                <div className={cn("text-11 leading-5 font-regular text-tertiary")}>
                  Desativar isto só permitirá que usuários se cadastrem quando forem convidados.
                </div>
              </div>
            </div>
            <div className={`shrink-0 pr-4 ${isSubmitting && "opacity-70"}`}>
              <div className="flex items-center gap-4">
                <ToggleSwitch
                  value={Boolean(parseInt(enableSignUpConfig))}
                  onChange={() => {
                    if (Boolean(parseInt(enableSignUpConfig)) === true) {
                      updateConfig("ENABLE_SIGNUP", "0");
                    } else {
                      updateConfig("ENABLE_SIGNUP", "1");
                    }
                  }}
                  size="sm"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          <div className="text-lg pt-6 font-medium">Modos de autenticação disponíveis</div>
          {authenticationModes.map((method) => (
            <AuthenticationMethodCard
              key={method.key}
              name={method.name}
              description={method.description}
              icon={method.icon}
              config={method.config}
              disabled={isSubmitting}
              unavailable={method.unavailable}
            />
          ))}
        </div>
      ) : (
        <Loader className="space-y-10">
          <Loader.Item height="50px" width="75%" />
          <Loader.Item height="50px" width="75%" />
          <Loader.Item height="50px" width="40%" />
          <Loader.Item height="50px" width="40%" />
          <Loader.Item height="50px" width="20%" />
        </Loader>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Authentication Settings - Avião Web" }];

export default InstanceAuthenticationPage;
