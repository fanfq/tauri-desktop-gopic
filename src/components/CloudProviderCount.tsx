import {
  cloudProviderCounts,
  type Profile,
  type ProviderId,
} from "../domain/model";

/** 统计标签继承云服务按钮的颜色和字重，随选中状态高亮；0 个配置时隐藏。 */
export function CloudProviderCount({
  provider,
  profiles,
}: {
  provider: ProviderId;
  profiles: readonly Profile[];
}) {
  const { enabled, total } = cloudProviderCounts(profiles, provider);
  if (!total) return null;
  const description = `${enabled} 个启用，共 ${total} 个配置`;
  return (
    <span
      className="ml-auto shrink-0 rounded bg-tint px-1.5 py-0.5 text-[11px] tabular-nums leading-none"
      title={description}
      aria-label={description}
    >
      {enabled}/{total}
    </span>
  );
}
