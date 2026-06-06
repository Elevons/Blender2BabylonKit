import { Behavior, exposed } from "../engine";
import { Color3 } from "@babylonjs/core";

/**
 * TEST behavior for the list element types that aren't visual (string, bool,
 * color) plus a plain enum. It doesn't move anything — it logs the values it
 * received once the level loads, so you can confirm the Blender values survived
 * export -> manifest -> runtime, and that color elements were coerced to Color3.
 *
 * Open the browser console after loading the level to see the output.
 */
export default class ExposedProbe extends Behavior {
  @exposed({ type: "enum", options: ["debug", "info", "silent"] })
  level = "info";

  @exposed({ type: "list", of: "string", label: "Messages" })
  messages: string[] = ["hello", "world"];

  @exposed({ type: "list", of: "bool", label: "Flags" })
  flags: boolean[] = [true, false, true];

  @exposed({ type: "list", of: "color", label: "Palette" })
  palette: Color3[] = []; // add entries in Blender; they arrive as Color3

  onStart() {
    if (this.level === "silent") return;
    const tag = `[ExposedProbe:${this.entity.name}]`;
    console.log(`${tag} level =`, this.level);
    console.log(`${tag} messages =`, this.messages);
    console.log(`${tag} flags =`, this.flags);
    // Each palette entry should be a real Color3 (note the .toHexString()).
    console.log(
      `${tag} palette =`,
      this.palette.map((c) => (c instanceof Color3 ? c.toHexString() : `RAW:${c}`))
    );
  }
}
