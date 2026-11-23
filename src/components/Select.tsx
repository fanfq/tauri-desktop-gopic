import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";
import { selectLayout } from "./select-layout";

export interface SelectOption {
  value: string;
  label: string;
}

/** 所有页面共用的受控选择器：焦点始终留在 combobox，取消操作不写回业务状态。 */
export function Select({
  value,
  options,
  onChange,
  label,
  placeholder = "请选择",
  disabled = false,
  variant = "default",
  icon,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  variant?: "default" | "compact" | "cloud";
  icon?: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState<ReturnType<typeof selectLayout>>();
  const search = useRef({ text: "", time: 0 });
  const selected = options.find((option) => option.value === value);
  const unavailable = disabled || options.length === 0;
  const expanded = open && !unavailable;
  const close = () => setOpen(false);
  const show = (last = false) => {
    if (unavailable) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : last ? options.length - 1 : 0);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    close();
    trigger.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (!expanded || !trigger.current) return;
    setLayout(
      selectLayout(
        trigger.current.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        close();
    };
    // 滚动菜单内部不关闭；页面/窗口滚动则关闭，防止浮层离开触发器。
    const scroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !menu.current?.contains(event.target)
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded)
      menu.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, layout]);

  // Portal 挂到当前 app 内继承主题，同时脱离 page-content 的 overflow 裁切。
  const host = trigger.current?.closest(".app");
  return (
    <div className={`ui-select ui-select-${variant}`}>
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        aria-activedescendant={
          expanded && options[active] ? `${id}-${active}` : undefined
        }
        disabled={unavailable}
        title={selected?.label ?? placeholder}
        onBlur={close}
        onClick={() => (expanded ? close() : show())}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === "Tab") {
            close();
            return;
          }
          if (key === "Escape") {
            if (expanded) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            return;
          }
          if (
            ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)
          ) {
            event.preventDefault();
            if (!expanded) {
              show(key === "ArrowUp");
              // Home/End 在收起状态也直接定位首尾，展开不提交选择。
              if (key === "Home") setActive(0);
              if (key === "End") setActive(options.length - 1);
              return;
            }
            if (key === "Enter" || key === " ") choose(active);
            else
              setActive((current) =>
                key === "Home"
                  ? 0
                  : key === "End"
                    ? options.length - 1
                    : (current +
                        (key === "ArrowUp" ? -1 : 1) +
                        options.length) %
                      options.length,
              );
          } else if (
            key.length === 1 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const now = Date.now();
            search.current.text =
              (now - search.current.time > 700 ? "" : search.current.text) +
              key.toLocaleLowerCase();
            search.current.time = now;
            const index = options.findIndex((option) =>
              option.label.toLocaleLowerCase().startsWith(search.current.text),
            );
            if (!expanded) show();
            if (index >= 0) setActive(index);
          }
        }}
      >
        {icon && <span className="select-icon">{icon}</span>}
        <span className="select-copy">
          {variant === "cloud" && (
            <span className="select-caption">{label}</span>
          )}
          <span className={`select-value ${selected ? "" : "is-placeholder"}`}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <CaretDown className="select-caret" size={13} />
      </button>
      {expanded &&
        layout &&
        host &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="select-menu"
            style={layout}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-index={index}
                className={`select-option ${index === active ? "is-active" : ""}`}
                title={option.label}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={14} weight="bold" />}
              </div>
            ))}
          </div>,
          host,
        )}
    </div>
  );
}
