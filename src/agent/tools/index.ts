import type { ToolRunner } from '../core/types';

import * as click from './click/index';
import * as typeTool from './type/index';
import * as hover from './hover/index';
import * as scroll from './scroll/index';
import * as pressKey from './press_key/index';

import * as find from './find/index';
import * as findByText from './find_by_text/index';
import * as findButton from './find_button/index';
import * as findInput from './find_input/index';

import * as getPageText from './get/page_text';
import * as getElementText from './get/element_text';
import * as getButtons from './get/buttons';
import * as getInputs from './get/inputs';
import * as getLinks from './get/links';
import * as getVisibleElements from './get/visible_elements';

import * as waitForElement from './wait/wait_for_element';
import * as waitForText from './wait/wait_for_text';

import * as goToUrl from './navigation/go_to_url';
import * as goBack from './navigation/go_back';
import * as refresh from './navigation/refresh';

import * as copy from './clipboard/copy';
import * as paste from './clipboard/paste';
import * as getSelected from './clipboard/get_selected';

import * as generateSelector from './selector/generate_selector';

import * as recordStart from './record/start';
import * as recordStop from './record/stop';
import * as recordReplay from './record/replay';

import * as screenshot from './screenshot/index';

export const toolRegistry: Record<string, ToolRunner> = {
  click: click.run,
  type: typeTool.run,
  hover: hover.run,
  scroll: scroll.run,
  press_key: pressKey.run,

  find: find.run,
  find_by_text: findByText.run,
  find_button: findButton.run,
  find_input: findInput.run,

  get_page_text: getPageText.run,
  get_element_text: getElementText.run,
  get_buttons: getButtons.run,
  get_inputs: getInputs.run,
  get_links: getLinks.run,
  get_visible_elements: getVisibleElements.run,

  wait_for_element: waitForElement.run,
  wait_for_text: waitForText.run,

  go_to_url: goToUrl.run,
  go_back: goBack.run,
  refresh: refresh.run,

  copy: copy.run,
  paste: paste.run,
  get_selected: getSelected.run,

  generate_selector: generateSelector.run,

  record_start: recordStart.run,
  record_stop: recordStop.run,
  record_replay: recordReplay.run,

  screenshot: screenshot.run,
};
