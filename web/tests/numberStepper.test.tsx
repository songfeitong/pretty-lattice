import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "bun:test";
import { useState } from "react";

import { NumberStepper } from "../src/components/ui/number-stepper";

function NumberStepperHarness() {
  const [value, setValue] = useState(1);

  return (
    <NumberStepper
      aria-label="Line width"
      min={0.5}
      max={2}
      step={0.5}
      suffix="px"
      value={value}
      onValueChange={setValue}
    />
  );
}

test("number stepper supports buttons, keyboard steps, and snapped direct input", async () => {
  const user = userEvent.setup();
  render(<NumberStepperHarness />);

  const input = screen.getByRole("textbox", { name: "Line width" }) as HTMLInputElement;
  expect(input.value).toBe("1.0");

  fireEvent.focus(input);
  expect(input.value).toBe("");
  fireEvent.blur(input);
  expect(input.value).toBe("1.0");

  await user.click(screen.getByRole("button", { name: "Line width +0.5" }));
  expect(input.value).toBe("1.5");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.value).toBe("1.0");

  const decreaseButton = screen.getByRole("button", { name: "Line width -0.5" });
  await user.click(decreaseButton);
  expect(input.value).toBe("0.5");
  expect(document.activeElement).toBe(decreaseButton);
  expect(input.matches(":focus")).toBe(false);
  expect((decreaseButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.blur(decreaseButton);
  const controls = decreaseButton.closest('[data-slot="number-stepper-controls"]');
  expect(controls).not.toBeNull();
  fireEvent.click(controls as HTMLElement);
  expect(input.matches(":focus")).toBe(false);

  await user.clear(input);
  await user.click(screen.getByRole("button", { name: "Line width +0.5" }));
  expect(input.value).toBe("1.0");

  await user.clear(input);
  await user.type(input, "1.8");
  fireEvent.blur(input);
  expect(input.value).toBe("2.0");
  expect(
    (screen.getByRole("button", { name: "Line width +0.5" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
