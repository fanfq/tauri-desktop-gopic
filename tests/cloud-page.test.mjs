import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { initialProfiles } from "../src/preview/model.ts";

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
});
after(() => server.close());
const { CloudPage } = await server.ssrLoadModule("/src/pages/Cloud.tsx");

test("every cloud provider displays its optional Account / App ID and saved value", () => {
  for (const profile of initialProfiles) {
    const html = renderToStaticMarkup(
      createElement(CloudPage, {
        provider: profile.provider,
        profiles: [{ ...profile, account: "saved-account-123" }],
        setProfiles: () => {},
        notify: () => {},
      }),
    );
    assert.ok(
      html.includes("Account / App ID<small>可选</small>"),
      profile.provider,
    );
    assert.ok(html.includes('value="saved-account-123"'), profile.provider);
  }
});

test("provider badges show enabled/total, update from props and disappear when empty", async () => {
  const { CloudProviderCount } = await server.ssrLoadModule(
    "/src/components/CloudProviderCount.tsx",
  );
  const profiles = [
    { ...initialProfiles[0], enabled: true },
    { ...initialProfiles[0], id: "r2-other", enabled: false },
    { ...initialProfiles.find((p) => p.provider === "qiniu"), enabled: true },
  ];
  const render = (profiles) =>
    renderToStaticMarkup(
      createElement(CloudProviderCount, { provider: "r2", profiles }),
    );
  assert.match(render(profiles), />1\/2<\/span>/);
  assert.match(render(profiles), /title="1 个启用，共 2 个配置"/);
  assert.match(
    render(profiles.map((p) => ({ ...p, enabled: false }))),
    />0\/2<\/span>/,
  );
  assert.equal(render(profiles.filter((p) => p.provider !== "r2")), "");
  assert.equal(render([]), "");
});
