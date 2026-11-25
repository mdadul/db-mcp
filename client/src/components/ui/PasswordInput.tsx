import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

/** Password input with a native-feeling reveal control. */
export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={`pr-9 ${props.className ?? ""}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-0.5 top-0.5"
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
