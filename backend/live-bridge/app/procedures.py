"""Structured ground-truth procedures for the research tutor workflow."""

from __future__ import annotations

from typing import Any


PROCEDURES: dict[str, dict[str, Any]] = {
    "mouse": {
        "device": "computer_mouse",
        "label": "Computer mouse",
        "disassemble": [
            {"id": 1, "action": "remove_screws", "instruction": "Remove the visible bottom screws.", "required_objects": ["screwdriver", "screw"], "expected_state": "bottom_screws_removed"},
            {"id": 2, "action": "separate_top_shell", "instruction": "Separate the top shell gently from the base.", "required_objects": ["mouse", "top_shell"], "expected_state": "top_shell_separated"},
            {"id": 3, "action": "disconnect_scroll_wheel", "instruction": "Disconnect or lift the scroll-wheel assembly.", "required_objects": ["scroll_wheel", "connector"], "expected_state": "scroll_wheel_disconnected"},
            {"id": 4, "action": "remove_pcb", "instruction": "Remove the PCB after checking that no cable remains attached.", "required_objects": ["pcb"], "expected_state": "pcb_removed"},
            {"id": 5, "action": "remove_sensor", "instruction": "Remove the sensor module only if the PCB is stable and disconnected.", "required_objects": ["sensor"], "expected_state": "sensor_removed"},
        ],
        "assemble": [
            {"id": 1, "action": "install_sensor", "instruction": "Place and secure the sensor module.", "required_objects": ["sensor"], "expected_state": "sensor_installed"},
            {"id": 2, "action": "install_pcb", "instruction": "Place the PCB and reconnect its cables.", "required_objects": ["pcb", "connector"], "expected_state": "pcb_installed"},
            {"id": 3, "action": "install_scroll_wheel", "instruction": "Fit the scroll-wheel assembly and check free movement.", "required_objects": ["scroll_wheel"], "expected_state": "scroll_wheel_installed"},
            {"id": 4, "action": "close_top_shell", "instruction": "Align and close the top shell without pinching cables.", "required_objects": ["top_shell"], "expected_state": "top_shell_closed"},
            {"id": 5, "action": "install_screws", "instruction": "Install and gently tighten the bottom screws.", "required_objects": ["screwdriver", "screw"], "expected_state": "screws_installed"},
        ],
    },
    "phone": {
        "device": "mobile_phone",
        "label": "Mobile phone",
        "disassemble": [
            {"id": 1, "action": "power_off_phone", "instruction": "Power off the phone and disconnect external power.", "required_objects": ["phone"], "expected_state": "phone_powered_off"},
            {"id": 2, "action": "remove_sim_tray", "instruction": "Remove the SIM tray if present.", "required_objects": ["sim_tool", "sim_tray"], "expected_state": "sim_tray_removed"},
            {"id": 3, "action": "loosen_back_cover", "instruction": "Loosen the back cover only with a suitable opening tool; do not puncture the battery.", "required_objects": ["opening_tool", "back_cover"], "expected_state": "back_cover_loose"},
            {"id": 4, "action": "disconnect_battery", "instruction": "Disconnect the battery connector before other internal connectors.", "required_objects": ["battery_connector"], "expected_state": "battery_disconnected"},
            {"id": 5, "action": "remove_modules", "instruction": "Remove modules one at a time while organizing screws and cables.", "required_objects": ["module", "screwdriver"], "expected_state": "modules_removed"},
        ],
        "assemble": [
            {"id": 1, "action": "install_modules", "instruction": "Install each module and confirm its connector orientation.", "required_objects": ["module", "connector"], "expected_state": "modules_installed"},
            {"id": 2, "action": "connect_battery", "instruction": "Reconnect the battery only after all other internal work is complete.", "required_objects": ["battery_connector"], "expected_state": "battery_connected"},
            {"id": 3, "action": "close_back_cover", "instruction": "Align the back cover and press around the perimeter evenly.", "required_objects": ["back_cover"], "expected_state": "back_cover_closed"},
            {"id": 4, "action": "install_sim_tray", "instruction": "Install the SIM tray without forcing it.", "required_objects": ["sim_tray"], "expected_state": "sim_tray_installed"},
            {"id": 5, "action": "power_on_phone", "instruction": "Power on only after checking the enclosure and battery condition.", "required_objects": ["phone"], "expected_state": "phone_powered_on"},
        ],
    },
    "cpu": {
        "device": "desktop_computer",
        "label": "CPU or desktop computer",
        "disassemble": [
            {"id": 1, "action": "disconnect_mains", "instruction": "Shut down, unplug mains power, and hold the power button briefly.", "required_objects": ["computer"], "expected_state": "mains_disconnected"},
            {"id": 2, "action": "remove_side_panel", "instruction": "Remove the side panel and place its screws together.", "required_objects": ["screwdriver", "side_panel"], "expected_state": "side_panel_removed"},
            {"id": 3, "action": "disconnect_internal_cables", "instruction": "Disconnect only the identified internal cables; do not open the PSU.", "required_objects": ["cable", "connector"], "expected_state": "cables_disconnected"},
            {"id": 4, "action": "remove_expansion_parts", "instruction": "Remove expansion cards, storage, or RAM as selected, using anti-static care.", "required_objects": ["component"], "expected_state": "selected_parts_removed"},
            {"id": 5, "action": "remove_motherboard", "instruction": "Remove the motherboard only after every cable and mounting screw is confirmed.", "required_objects": ["motherboard", "screwdriver"], "expected_state": "motherboard_removed"},
        ],
        "assemble": [
            {"id": 1, "action": "install_motherboard", "instruction": "Place the motherboard on the correct standoffs and secure it gently.", "required_objects": ["motherboard", "screwdriver"], "expected_state": "motherboard_installed"},
            {"id": 2, "action": "install_components", "instruction": "Install the selected RAM, storage, or expansion parts.", "required_objects": ["component"], "expected_state": "components_installed"},
            {"id": 3, "action": "connect_internal_cables", "instruction": "Reconnect power and data cables using their keyed orientations.", "required_objects": ["cable", "connector"], "expected_state": "cables_connected"},
            {"id": 4, "action": "install_side_panel", "instruction": "Check for loose parts, then install the side panel.", "required_objects": ["side_panel", "screwdriver"], "expected_state": "side_panel_installed"},
            {"id": 5, "action": "validate_power", "instruction": "Reconnect mains power and test only after the case is closed.", "required_objects": ["computer"], "expected_state": "computer_powered_on"},
        ],
    },
}


def get_procedure(product_id: str, action: str) -> list[dict[str, Any]]:
    product = PROCEDURES.get(product_id)
    if not product:
        return []
    return list(product.get(action, []))
