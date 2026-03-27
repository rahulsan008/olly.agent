import type { ToolRunner } from '../core/types';

import * as click from './click/index';
import * as typeTool from './type/index';
import * as hover from './hover/index';
import * as scroll from './scroll/index';
import * as pressKey from './press_key/index';

import * as find from './find/index';
import * as findByText from './find_by_text/index';
import * as findButton from './find_button/index';
import * as buttonById from './button_byid/index';
import * as findButtons from './find_buttons/index';
import * as findInput from './find_input/index';
import * as inputById from './input_byid/index';

import * as getPageText from './get/page_text';
import * as getElementText from './get/element_text';
import * as getButtons from './get/buttons';
import * as getInputs from './get/inputs';
import * as getLinks from './get/links';
import * as getVisibleElements from './get/visible_elements';
import * as extract from './extract/index';

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
import * as clickCoordinates from './click_coordinates/index';

import * as igLikePost from './instagram/like_post';
import * as igCommentPost from './instagram/comment_post';
import * as igGetPostContext from './instagram/get_post_context';
import * as igGetGridPosts from './instagram/get_grid_posts';
import * as igOpenGridPost from './instagram/open_grid_post';
import * as igClosePostView from './instagram/close_post_view';
import * as getNewPlan from './get_new_plan/index';
import * as understandScreen from './understand_screen/index';
import * as classifyPageState from './classify_page_state/index';
import * as extractStructuredData from './extract_structured_data/index';
import * as rankCandidates from './rank_candidates/index';
import * as generateSearchQuery from './generate_search_query/index';
import * as rewriteActionQuery from './rewrite_action_query/index';
import * as detectBlocker from './detect_blocker/index';
import * as composeText from './compose_text/index';
import * as think from './think/index';
import * as summarize from './summarize/index';
import * as verifyTaskCompletion from './verify_task_completion/index';
import * as strategyReplan from './strategy_replan/index';
import * as startTrace from './state/start_trace';
import * as getTrace from './state/get_trace';
import * as clearTrace from './state/clear_trace';
import * as visualClick from './visual_click/index';
import * as randomCoordinatesByText from './random_coordinates_by_text/index';

export const toolRegistry: Record<string, ToolRunner> = {
  click: click.run,
  type: typeTool.run,
  hover: hover.run,
  scroll: scroll.run,
  press_key: pressKey.run,

  find: find.run,
  find_by_text: findByText.run,
  find_button: findButton.run,
  button_byid: buttonById.run,
  find_buttons: findButtons.run,
  find_input: findInput.run,
  input_byid: inputById.run,

  get_page_text: getPageText.run,
  get_element_text: getElementText.run,
  get_buttons: getButtons.run,
  get_inputs: getInputs.run,
  get_links: getLinks.run,
  get_visible_elements: getVisibleElements.run,
  extract: extract.run,

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
  click_coordinates: clickCoordinates.run,

  ig_like_post: igLikePost.run,
  ig_comment_post: igCommentPost.run,
  ig_get_post_context: igGetPostContext.run,
  ig_get_grid_posts: igGetGridPosts.run,
  ig_open_grid_post: igOpenGridPost.run,
  ig_close_post_view: igClosePostView.run,
  get_new_plan: getNewPlan.run,
  understand_screen: understandScreen.run,
  classify_page_state: classifyPageState.run,
  extract_structured_data: extractStructuredData.run,
  rank_candidates: rankCandidates.run,
  generate_search_query: generateSearchQuery.run,
  rewrite_action_query: rewriteActionQuery.run,
  detect_blocker: detectBlocker.run,
  compose_text: composeText.run,
  think: think.run,
  summarize: summarize.run,
  verify_task_completion: verifyTaskCompletion.run,
  strategy_replan: strategyReplan.run,

  start_trace: startTrace.run,
  get_trace: getTrace.run,
  clear_trace: clearTrace.run,
  visual_click: visualClick.run,
  random_coordinates_by_text: randomCoordinatesByText.run,
};
